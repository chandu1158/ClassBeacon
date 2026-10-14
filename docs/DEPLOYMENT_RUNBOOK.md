# ClassBeacon — Stage 10 Deployment Runbook & Operations Manual

## 1. Pre-Deployment Verification Checklist

Before deploying rules or hosting:
- [x] Strict TypeScript typecheck passes (`npm run typecheck --prefix apps/web`)
- [x] All unit and property tests pass (`npm run test --prefix apps/web`)
- [x] Web build succeeds cleanly (`npm run build --prefix apps/web`)
- [x] No `private_key` or service account credentials in `apps/web/dist/`
- [x] Target plan confirmed as **Spark** (no-cost)

---

## 2. Deployment Commands

### Deploy Security Rules & Firestore Indexes
```bash
firebase deploy --only firestore:rules,firestore:indexes --project communicationpath-e5990
```

### Deploy Firebase Hosting Static Application
```bash
npm run build --prefix apps/web
firebase deploy --only hosting --project communicationpath-e5990
```

---

## 3. Release Tagging & Rollback Procedures

### Tag Release Commit
```bash
git tag -a release-$(date +%Y%m%d) -m "Production release YYYYMMDD"
git push origin release-$(date +%Y%m%d)
```

### Emergency Hosting Rollback
If a bad web release occurs:
1. Open [Firebase Console Hosting Page](https://console.firebase.google.com/project/communicationpath-e5990/hosting/main).
2. Find the previous deployment in the **Release History**.
3. Click **Rollback** to revert instantly to the previous static build.

### Emergency Rules Rollback
If a rules regression occurs:
1. Open [Firebase Console Firestore Rules Page](https://console.firebase.google.com/project/communicationpath-e5990/firestore/rules).
2. Click **Rules Version History**.
3. Select the last known good version and click **Release**.

---

## 4. Emergency Operations Runbook

### Suspected Account Compromise
1. Run admin revocation script:
   ```bash
   FIREBASE_PROJECT_ID=communicationpath-e5990 node admin/scripts/revokeTokens.js --uid <COMPROMISED_UID> --disable true
   ```
2. Review sessions and events for that UID in the last 30 days via `exportStudent.js`.
3. Reset user credentials.

### Student Data Access / Deletion Request (GDPR / DPDP)
1. Run data export script:
   ```bash
   FIREBASE_PROJECT_ID=communicationpath-e5990 node admin/scripts/exportStudent.js --uid <STUDENT_UID>
   ```
2. Or run permanent deletion script:
   ```bash
   FIREBASE_PROJECT_ID=communicationpath-e5990 node admin/scripts/deleteStudent.js --uid <STUDENT_UID> --confirm yes --deleteAuth true
   ```
