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

const RULES_PATH = '../../firebase/firestore.rules';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'classbeacon-stage8-test',
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

describe('Stage 8 Exit Gate: Abuse Prevention & Load Limits', () => {
  beforeEach(async () => {
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

  describe('Abuse Prevention & Limits Enforcement', () => {
    it('rejects event with oversized details map (>10 keys)', async () => {
      const db = asUser('student1', 'student');
      const oversizedDetails: Record<string, number> = {};
      for (let i = 0; i < 11; i++) {
        oversizedDetails[`key_${i}`] = i;
      }

      await assertFails(
        setDoc(doc(db, 'sessions', 'sess1', 'events', 'evt_oversized'), {
          type: 'play',
          seq: 1,
          clientAt: Date.now(),
          serverAt: serverTimestamp(),
          details: oversizedDetails, // 11 keys > 10 cap
          expireAt: serverTimestamp(),
        }),
      );
    });

    it('rejects report text exceeding 2000 characters', async () => {
      const db = asUser('student1', 'student');
      const oversizedText = 'A'.repeat(2001);

      await assertFails(
        setDoc(doc(db, 'reports', 'rep_oversized'), {
          sessionId: 'sess1',
          studentUid: 'student1',
          sectionId: 'sec_A',
          text: oversizedText,
          status: 'pending',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('accepts valid event payload under size and key bounds', async () => {
      const db = asUser('student1', 'student');
      await assertSucceeds(
        setDoc(doc(db, 'sessions', 'sess1', 'events', 'evt_valid'), {
          type: 'play',
          seq: 1,
          clientAt: Date.now(),
          serverAt: serverTimestamp(),
          details: { pos: 10, rate: 1.0 }, // 2 keys <= 10 cap
          expireAt: serverTimestamp(),
        }),
      );
    });
  });
});
