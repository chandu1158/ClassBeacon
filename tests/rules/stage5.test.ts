import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  doc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { EVENT_TYPES } from '../../apps/web/src/lib/constants';

const RULES_PATH = '../../firebase/firestore.rules';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'classbeacon-stage5-test',
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function asUser(uid: string, role: string): Firestore {
  return testEnv
    .authenticatedContext(uid, { role })
    .firestore() as unknown as Firestore;
}

describe('Stage 5 Exit Gate: Contract & Event Security Rules Tests', () => {
  beforeEach(async () => {
    // Seed enrollment and active session for student1
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, 'enrollments', 'sec_A_student1'), {
        sectionId: 'sec_A',
        studentUid: 'student1',
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'sessions', 'sess1'), {
        studentUid: 'student1',
        assignmentId: 'assign1',
        sectionId: 'sec_A',
        status: 'active',
        startedAt: serverTimestamp(),
        lastEventAt: serverTimestamp(),
        eventCount: 0,
        expireAt: serverTimestamp(),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Mandatory Contract Test: Every value in EVENT_TYPES is accepted
  // ─────────────────────────────────────────────────────────────────────────────
  describe('EVENT_TYPES Contract Test', () => {
    for (const eventType of EVENT_TYPES) {
      it(`accepts event type: "${eventType}"`, async () => {
        const db = asUser('student1', 'student');
        await assertSucceeds(
          setDoc(doc(db, 'sessions', 'sess1', 'events', `evt_${eventType}`), {
            type: eventType,
            seq: 1,
            clientAt: Date.now(),
            serverAt: serverTimestamp(),
            details: { pos: 10 },
            expireAt: serverTimestamp(),
          }),
        );
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Rejection Tests (Unknown types, ownership, session limits)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Event Security Rejections', () => {
    it('rejects unknown / non-allowlisted event type', async () => {
      const db = asUser('student1', 'student');
      await assertFails(
        setDoc(doc(db, 'sessions', 'sess1', 'events', 'evt_unknown'), {
          type: 'malicious_custom_event',
          seq: 1,
          clientAt: Date.now(),
          serverAt: serverTimestamp(),
          details: {},
          expireAt: serverTimestamp(),
        }),
      );
    });

    it('rejects event creation for another student session', async () => {
      // Seed another student session
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore() as unknown as Firestore;
        await setDoc(doc(db, 'sessions', 'sess2'), {
          studentUid: 'student2',
          assignmentId: 'assign1',
          sectionId: 'sec_A',
          status: 'active',
          startedAt: serverTimestamp(),
          lastEventAt: serverTimestamp(),
          eventCount: 0,
          expireAt: serverTimestamp(),
        });
      });

      const db = asUser('student1', 'student'); // student1 attempting to write to student2's session
      await assertFails(
        setDoc(doc(db, 'sessions', 'sess2', 'events', 'evt_unauth'), {
          type: 'play',
          seq: 1,
          clientAt: Date.now(),
          serverAt: serverTimestamp(),
          details: {},
          expireAt: serverTimestamp(),
        }),
      );
    });

    it('rejects 501st event when session event cap is reached (eventCount >= 500)', async () => {
      // Seed session at capacity
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore() as unknown as Firestore;
        await setDoc(doc(db, 'sessions', 'sess_capped'), {
          studentUid: 'student1',
          assignmentId: 'assign1',
          sectionId: 'sec_A',
          status: 'active',
          startedAt: serverTimestamp(),
          lastEventAt: serverTimestamp(),
          eventCount: 500, // Cap reached
          expireAt: serverTimestamp(),
        });
      });

      const db = asUser('student1', 'student');
      await assertFails(
        setDoc(doc(db, 'sessions', 'sess_capped', 'events', 'evt_overflow'), {
          type: 'play',
          seq: 501,
          clientAt: Date.now(),
          serverAt: serverTimestamp(),
          details: {},
          expireAt: serverTimestamp(),
        }),
      );
    });
  });
});
