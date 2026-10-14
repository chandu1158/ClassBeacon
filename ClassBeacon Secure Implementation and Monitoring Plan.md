# ClassBeacon: Secure Implementation and Monitoring Plan

Stack: React + Vite + TypeScript (strict), Firebase Auth, Cloud Firestore, Firebase Hosting, Emulator Suite. Target plan: Spark (no cost).

Status of this document: a plan and design. Nothing here has been built, tested, or penetration-tested yet. Claims of security are only made after the matching test in Section 9 passes.

## 1. Honest ground rules

1. I have not inspected your starter ZIP (it was not attached here). The four defects in Section 2 come from the earlier review, not from a fresh code audit. Stage 1 starts with a real audit.
2. **Spark has no trusted server.** Cloud Functions need the Blaze plan. So on Spark, every guarantee must come from Firestore Security Rules, or be labelled as manipulable.
3. A hostile student can run scripts with their own valid login. Rules can bound what they can write; they cannot prove a human watched the video.
4. Playback, tab visibility and camera are separate signals. Reports never claim 'attentive' or 'cheating'. They show recorded signals and missing signals separately.
5. No deploy, billing change, data deletion or destructive command without your explicit approval (approval gates are marked **GATE**).

## 2. Known defects in the earlier starter (fix first)

| # | Defect | Fix |
| --- | --- | --- |
| D1 | Progress used a wrong maximum playback position | Remove max-position logic entirely. Use unique watched chunks (Section 5) |
| D2 | Rules rejected event types the client wrote | One shared `EVENT_TYPES` constant drives client code, rules generation and a contract test that writes every type against the rules |
| D3 | Client-reported progress is forgeable | Rules-bounded chunk map (Section 5); stronger tier is optional trusted validator (Section 5.4) |
| D4 | Lesson library not scoped to sections | Section-scoped assignments and enrolment checks in rules (Section 4) |
| D5 | Failed security-sensitive writes could be discarded | Retry queue with backoff, visible 'not saved' state, error log event |

## 3. Architecture and trust boundaries

- **Browser (untrusted):** React UI, custom video player, event collector.
- **Firebase Auth:** identity. Role is a **custom claim** (`role: staff | student | admin`) set only by an administrator script, never by a client.
- **Firestore + Rules (the enforcement point):** ownership, section scope, schema, rate and state-transition checks.
- **Admin tooling (your machine only):** Node scripts using Firebase Admin SDK for provisioning, bulk student import, claim changes, token revocation, data deletion. Service-account keys stay outside the repo and outside the browser. Use application default credentials and never commit a key.
- **Hosting:** static build, HTTPS, security headers (Section 8).

Why no backend: roles, section scope, validation and rate bounds can be enforced in rules. A trusted backend is only needed for (a) creating Auth accounts on behalf of staff, handled by the local admin script instead, and (b) provable progress validation, which is optional Tier 2 below.

### Threat model (STRIDE-style summary)

| Threat | Example | Control |
| --- | --- | --- |
| Role escalation | Student writes `role: staff` | Roles only in claims; `users` doc role field not client-writable |
| Cross-user access | Student edits a session ID in a URL | Rules compare `studentUid` to `request.auth.uid` |
| Cross-section staff access | Staff reads another teacher's section | Reads require `request.auth.uid in section.staffUids` |
| Forged progress | Client sends 100% | Chunk map bounded by elapsed server time |
| Event spam / cost abuse | Loop writing events | Per-session counters, minimum spacing, size caps, App Check |
| Stored XSS | Malicious student report text or video title | React escaping, no `dangerouslySetInnerHTML`, CSP, length limits |
| Malicious media URL | `javascript:` or tracking host | `https:` only, extension allowlist, optional domain allowlist |
| Token theft | XSS reads IndexedDB token | CSP, dependency pinning, short tokens, revocation script |
| Secret leakage | Service-account key in repo | Secret scanning in CI and pre-commit |
| Quota exhaustion | Daily Spark limit reached | Write budget (Section 6), degrade gracefully |

## 4. Data model

```
users/{uid}                      displayName, active, createdAt        (role lives in claims)
sections/{sectionId}             name, ownerUid, staffUids[], createdAt
enrollments/{sectionId}_{uid}    sectionId, studentUid, createdAt      (staff create/delete only)
videos/{videoId}                 title, sourceUrl, durationSec, ownerUid
assignments/{assignmentId}       sectionId, videoId, title, sourceUrl, durationSec,
                                 completionThreshold, policy{sequential, pauseOnHidden,
                                 hiddenAlertSec, maxRate}, dueAt, createdBy
sessions/{sessionId}             studentUid, assignmentId, sectionId, status, startedAt,
                                 lastEventAt, eventCount, expireAt
sessions/{sessionId}/events/{id} type, seq, clientAt, serverAt, details{}, expireAt
progress/{assignmentId}_{uid}    studentUid, assignmentId, sectionId, durationSec, chunkSec,
                                 totalChunks, chunks{index:true}, lastBeatAt, completedAt
reports/{reportId}               sessionId, studentUid, sectionId, text, status, createdAt
reviews/{sessionId}_{n}          staff-only alert review and resolution notes
consents/{uid}_{version}         studentUid, noticeVersion, acceptedAt
```

Design choices:

- Assignment copies the media URL and duration (snapshot), so students never read the `videos` collection and later edits cannot change a started lesson.
- Student flow: query own `enrollments` → query `assignments` per section. Rules use `exists()` on the enrolment document. **Whether this query shape is accepted by rules must be proven in the emulator** (this is the 'query constraints match rules' test).
- Alerts are **derived** by the staff dashboard from stored events. Student-created alert documents would be forgeable.
- Every document that grows has an `expireAt` field for retention (Section 8).

## 5. Correct progress tracking

### 5.1 Client algorithm

- Collect played intervals only while `playing` is true and not `waiting`/`seeking`. Sample `currentTime` on `timeupdate` and a 1 s timer, and drop any sample where the jump exceeds `maxRate × elapsed + tolerance` (that is a seek, not playback).
- Merge overlapping intervals (sort, then fold) to compute unique seconds. This pure function is property-tested.
- Quantise to **5-second chunks**: a chunk is marked only when at least 80% of it was played continuously.
- Lock playback rate at or below `policy.maxRate`. If `sequential` is on, block forward seeking beyond the furthest validly watched point and show a message.

### 5.2 What rules enforce (design sketch, to be proven by tests)

```
match /progress/{pid} {
  allow update: if isStudent() && resource.data.studentUid == request.auth.uid
    && request.resource.data.diff(resource.data).affectedKeys()
         .hasOnly(['chunks','lastBeatAt','completedAt'])
    && request.resource.data.lastBeatAt == request.time
    && request.time > resource.data.lastBeatAt + duration.value(10, 's')
    && request.resource.data.chunks.diff(resource.data.chunks).removedKeys().size() == 0
    && request.resource.data.chunks.diff(resource.data.chunks).changedKeys().size() == 0
    && request.resource.data.chunks.keys().size() <= resource.data.totalChunks
    && request.resource.data.chunks.keys().size() - resource.data.chunks.keys().size()
         <= ((request.time - resource.data.lastBeatAt).seconds()
             * resource.data.maxRate / resource.data.chunkSec) + 2
    && (!('completedAt' in request.resource.data.diff(resource.data).affectedKeys())
        || request.resource.data.chunks.keys().size() * resource.data.chunkSec
             >= resource.data.threshold * resource.data.durationSec);
}
```

Effect: unique credit can only grow, never past the video length, and never faster than real elapsed server time. `completedAt` can only be set when the stored chunk count meets the threshold. Immutable fields (`studentUid`, `assignmentId`, `sectionId`, `durationSec`) are not in the allowed list.

### 5.3 What a hostile client can still do (document this to staff)

- Run a script that plays the video muted in a background tab at real-time speed and earn full credit without watching.
- Mark the wrong chunks (credit for content it skipped), though never more total chunks than elapsed real time allows.
- Insert out-of-range chunk keys. Rules cannot iterate keys, so the dashboard counts only keys in `0..totalChunks-1` and flags anomalies.
- Under-report events (omit tab-hidden events). Missing events are not proof of good behaviour.

### 5.4 Optional stronger tier (needs your approval)

- **Tier 1 (Spark, default):** rules-bounded chunks as above.
- **Tier 2:** a trusted validator that recomputes progress from events and signed heartbeats. Requires Cloud Functions or Cloud Run on **Blaze**, or a self-hosted service. Even then it only raises the cost of cheating; it cannot prove attention. Only adopt it if high-stakes completion requires it. If Blaze is ever enabled: budget alerts do not cap spending, so set quotas and alert thresholds first.

## 6. Cost safeguards (Spark free-tier budget)

Free limits to verify on the current Firebase pricing page before launch: about 50,000 reads, 20,000 writes and 20,000 deletes per day. Spark cannot bill; exceeding quota makes requests fail, so protect availability instead.

| Control | Value |
| --- | --- |
| Progress and heartbeat | One merged write every 30 s per active student (about 120 writes per student-hour) |
| Discrete events | Only pause, seek attempt, hidden/visible, offline/online, session start/end, about 10 per hour |
| Capacity estimate | roughly 20,000 / 130 ≈ 150 student-hours of watching per day |
| Event cap | 500 per session, minimum 1 s spacing, `details` under 500 bytes |
| Staff dashboard | Paginated (25 rows), fetch on demand with optional 60 s refresh; avoid live listeners on whole sections (each change costs a read) |
| Queries | Always bounded with `limit()`; composite indexes declared in `firestore.indexes.json` |
| Quota hit | Client queues locally, shows 'saving delayed', retries with exponential backoff |

Warn-list of services that may need billing: Cloud Storage for Firebase (new buckets), Cloud Functions, phone/SMS auth, multi-factor auth via Identity Platform, some App Check providers at volume. Not used in this version unless you approve.

## 7. Step-by-step delivery plan with exit gates

Each stage ends with: files changed, commands, expected results, test output, security findings and fixes, remaining limits. A stage is not done until its gate passes.

**Stage 0: Audit (no code changes).** Read the starter repo. Reproduce D1–D5. Produce a written findings list ranked by severity. Gate: you review the list.

**Stage 1: Foundation.** Repo structure (`apps/web`, `firebase/`, `admin/`, `tests/`, `docs/`), strict TypeScript, ESLint, Vitest, Emulator config (Auth, Firestore, Hosting), `.env.example`, `.gitignore`, secret scan hook, CI workflow. Gate: `npm run lint && npm run typecheck && npm test && npm run build` all pass; emulators start with one command.

**Stage 2: Identity and roles.** Admin script to create users and set claims (`staff`, `student`) and revoke tokens; login UI; route guards (UX only); `users` rules. Gate: rule tests for unauthenticated denial and role-escalation denial pass.

**Stage 3: Sections, enrolment, videos, assignments.** CRUD for staff within their sections; student assignment list. Gate: tests for cross-section staff denial, student sees only enrolled assignments, query constraints match rules.

**Stage 4: Player and progress.** Custom player, interval-merge function (property tests with fast-check: replay, overlap, skip, speed), chunk writer, resume, offline queue. Gate: all 'real-world case' unit tests pass; rule tests reject impossible progress and early completion.

**Stage 5: Session events and monitoring notice.** Consent screen before first session, event collector, allowlisted types, throttling, hidden-tab policy. Gate: contract test writes every client event type; unknown types, negative positions and ownership changes rejected.

**Stage 6: Staff reporting.** Per-student, per-section and per-session views, derived alerts, review/resolve, CSV export limited to authorized sections, CSV formula-injection escaping (prefix `=`, `+`, `-`, `@` cells). Gate: unauthorized export/report tests deny.

**Stage 7: Privacy, retention, accessibility.** Notice page, student view of own data, retention fields and TTL, deletion script, keyboard and screen-reader support, captions control, contrast. Gate: axe checks and manual keyboard run pass.

**Stage 8: Hardening.** CSP and headers, App Check in monitor mode then enforcement after verification, API key referrer restriction, dependency audit, load and abuse test in emulator. Gate: no high/critical audit findings unresolved; abuse tests bounded by caps.

**Stage 9: Pilot.** Staging Firebase project (separate from production), 1 section, 5–10 students, one week. Gate: you approve results.

**Stage 10: Release (GATE: explicit approval).** Deploy rules, indexes, Hosting; tag release; rollback ready.

## 8. Security controls checklist

**Authentication**

- Email/password with enumeration protection enabled; strong password policy; email verification for staff.
- Staff and student accounts provisioned by admin script, no public sign-up.
- Staff MFA needs Identity Platform (billing). Not on Spark; compensate with admin-provisioned accounts and fast revocation.
- Deactivation: set `active=false`, revoke refresh tokens, and have write rules also check an `active` flag in the enrolment/profile where the extra read is affordable.

**Rules**

- Default deny (`match /{document=**} { allow read, write: if false; }`), then explicit matches.
- Helper functions: `isSignedIn`, `hasRole`, `isSectionStaff(sectionId)`, `isEnrolled(sectionId)`, `unchanged(fields)`, `validString(x, min, max)`.
- `hasOnly` field allowlists on every write; type, size and range checks; `serverAt == request.time`.
- No `get()` chains beyond rule call limits; validate cost in tests.

**Browser**

- CSP: `default-src 'self'; script-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; media-src https:; frame-ancestors 'none'; base-uri 'none'`. Tighten `media-src` to an allowlist of hosts once known. Test carefully, since Firebase and App Check need specific hosts.
- Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` denying camera/mic/geolocation (no camera feature in this version), HSTS via Hosting HTTPS.
- Video element uses `referrerpolicy='no-referrer'`; note that third-party media hosts still see student IP addresses.
- Firebase web config values are identifiers, not secrets, but restrict the API key to your domains in Google Cloud console.

**Supply chain and secrets**

- Lockfile committed, `npm audit`, Dependabot, pinned versions, gitleaks in CI and pre-commit.
- No Admin SDK or service-account file in `apps/web`; CI check greps the build output for `private_key`.

**Data lifecycle**

- `expireAt` on sessions, events and reports (suggested: 180 days; set per your policy). Firestore TTL policy configured per collection group (needs your approval; confirm current TTL pricing and Spark support).
- Student data export and deletion through admin script, with an audit note.

## 9. Mandatory automated tests

Tooling: `@firebase/rules-unit-testing` with the Firestore emulator, Vitest, fast-check, Playwright for end-to-end with a local sample video.

| Area | Cases |
| --- | --- |
| Unauthenticated | Read and write of every collection denied |
| Student isolation | Cannot read or write another student's session, events, progress, reports, enrolments |
| Role escalation | Cannot create or edit `users` role, claims fields, or write to `sections` |
| Staff scope | Staff A cannot read, assign or export Staff B's section; cannot enrol into it |
| Assignment gate | Student cannot create a session or progress doc for an unassigned or unenrolled assignment |
| Validation | Negative position, NaN, oversized text, unknown event type, extra fields, wrong types rejected |
| Progress | Skip-ahead gains nothing; replay gains nothing; chunk growth above elapsed bound rejected; chunk removal rejected; completion below threshold rejected |
| Immutability | `studentUid`, `assignmentId`, `sectionId`, `startedAt` cannot change |
| Spam | 501st event rejected; events faster than 1 s rejected |
| Query parity | Every UI query is executed against rules in test, so a rule change that breaks a query fails CI |
| Contract | Every value in `EVENT_TYPES` is accepted; anything else rejected |
| Exports | CSV denied for non-owners; formula-injection cells escaped |
| Build | Bundle contains no secrets; `typecheck`, `lint`, `audit`, `build` pass |

Reporting rule: I report real results only. A failed test is shown, fixed, and re-run before moving on. I will not call the app secure or penetration-tested; the honest wording is 'passed these listed automated checks'. A manual or external penetration test is a separate task.

## 10. Monitoring guide

### 10.1 Signals and how far to trust them

| Signal | Source | Reliability | Caveats |
| --- | --- | --- | --- |
| Played intervals | Media events | Medium | Scriptable by hostile client |
| Pause / seek attempts | Media events | Medium | Only seen if the client reports them |
| Tab hidden / visible | Page Visibility API | Medium | Fires on screen lock, app switch, notification shade, battery saver, incoming call, phone rotation |
| Window blur (focus lost) | `blur` event | Low | Fires when clicking the address bar, dev tools, other windows side by side |
| Connection lost / restored | `offline`/`online` and heartbeat gap | Medium | Missing heartbeat can mean sleep, battery saver, or router problem |
| Heartbeat gap | Server timestamps | Medium | Server time is trusted; client time is only informational |
| Student report | Form | Context only | Self-reported |

Not detectable: a second device, someone else watching, attention, or what is on other screens. Camera presence is out of scope in this version.

### 10.2 Default alert rules (staff-configurable per assignment)

| Rule | Default | Behaviour |
| --- | --- | --- |
| Tab hidden too long | 60 s | Pause video if `pauseOnHidden`; staff see a derived alert; auto-clears on return |
| Hidden count | 5 per session | Student shown a reminder, staff see a count |
| Heartbeat gap | 90 s while playing | Status 'disconnected'; resume from last saved checkpoint |
| Forward seek attempt | Each | Blocked if sequential; logged |
| Rate change attempt | Each | Reset to allowed rate; logged |
| Student report submitted | Each | Appears in the staff queue with review status |
| Progress anomaly | Out-of-range keys or implausibly regular heartbeat | Marked 'needs review', never auto-penalised |

### 10.3 Student-facing notice (required before first lesson)

> ClassBeacon records: which parts of a video you play, pauses and seeks, whether the lesson tab is visible, and connection interruptions. It does not use your camera, microphone, screen, or keyboard. Your teachers for this section can see this data. It is kept for \[N\] days. You can ask for a copy or for deletion by contacting \[contact\]. Interruptions can have normal causes such as phone calls or poor connections; you can explain any interruption using the report button.

Store acceptance in `consents` with the notice version. Re-ask when the notice version changes. Students under legal age may require parent/guardian consent or institutional authority, and some jurisdictions restrict behavioural monitoring of children (for example, India's DPDP Act 2023 for under-18s). Get a legal or school-policy review before real use. I am not a lawyer.

### 10.4 Staff interpretation guide

1. Read signals separately. Do not combine them into one 'attention score'.
2. A missing signal is unknown, not misconduct. Distinguish 'no events recorded' from 'events recorded and clean'.
3. Check the pattern across sessions before acting on a single one. Mobile browsers produce many harmless hidden events.
4. Look at the student report first; a technical explanation outranks an inferred interruption.
5. Completion means 'unique watched chunks met the threshold under the recorded conditions', not 'learned the material'.
6. Record the review outcome (resolved, needs follow-up, technical issue) in `reviews`.
7. Exports contain personal data. Share only as your policy allows and delete afterwards.

### 10.5 Session timeline view (per student)

Show: session start/end, play/pause spans, seek attempts, hidden spans with duration, disconnect spans, reports, and the watched-chunk bar (watched, unwatched, out of range). Mark every inferred item with its source signal.

## 11. Operations runbooks

**Suspected account compromise:** disable user, revoke refresh tokens (admin script), review sessions in the last 30 days, reset credentials, record the incident.

**Rules regression found:** do not edit in the console. Fix in git, add a failing test first, run the emulator suite, redeploy after approval. If the live rules are wrong, roll back via Firebase console rules history to the last tagged version.

**Quota exhausted:** the app shows 'saving delayed'; reduce heartbeat to 60 s with a config flag, ask students to pause, or move to a new day. Do not enable Blaze without approval.

**Bad release:** roll back Hosting to the previous release in the console (or `firebase hosting:clone`), then roll back rules if they changed in the same release. Keep tags `release-YYYYMMDD` for both.

**Student data request:** run the admin export or delete script for that `studentUid`, log date and operator.

## 12. Deployment checklist (every step needs your go-ahead)

1. Create a separate staging project; run Stage 9 there.
2. Confirm plan is Spark; confirm no Storage bucket, Functions or Blaze features enabled.
3. Run the full suite on the release commit and save the output.
4. Deploy `firestore.rules` and `firestore.indexes.json` to staging, rerun smoke tests; then production.
5. Deploy Hosting; verify headers with a browser check.
6. Enable App Check in monitor mode, review metrics, then enforce.
7. Publish the privacy notice; record the notice version.
8. Tag the release; record the rollback target.

## 13. Known limitations

- Progress and events are client-reported; Spark rules only bound them.
- Tab and focus signals produce false positives, especially on phones.
- No secure creation of student Auth accounts from the browser on Spark; use the admin script.
- No uploaded video hosting on Spark (Storage requires Blaze for new buckets). Supported: direct MP4/WebM/OGG URLs and local development media. YouTube-style embeds do not give reliable interval tracking and are out of scope.
- Third-party video hosts can see viewer IP addresses.
- Staff MFA needs a billed identity upgrade.
- Free-tier quotas (about 150 student-hours per day) limit class size; load testing and quota re-checks are required before scaling.
- Not penetration-tested. A pilot, then an independent review, is advisable before wide use.

## 14. Immediate next steps

1. Send the starter ZIP (or the repo) so Stage 0 can audit the real code.
2. Confirm the retention period, the minimum student age group, and whether you need a Tier 2 trusted validator.
3. Confirm a separate staging Firebase project may be used.

On your go-ahead I begin Stage 0 and then Stage 1 with full code, commands and test results.
