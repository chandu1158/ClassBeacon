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
  getDoc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

const RULES_PATH = '../../firebase/firestore.rules';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'classbeacon-stage6-test',
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

describe('Stage 6 Exit Gate: Staff Scope & Unauthorized Report Access', () => {
  beforeEach(async () => {
    // Seed section sec_A owned by staffA
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, 'sections', 'sec_A'), {
        name: 'Section A',
        ownerUid: 'staffA',
        staffUids: [],
        createdAt: serverTimestamp(),
      });

      // Seed report for sec_A
      await setDoc(doc(db, 'reports', 'rep_A'), {
        sessionId: 'sess_A',
        studentUid: 'student1',
        sectionId: 'sec_A',
        text: 'Technical issue',
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Seed session for sec_A
      await setDoc(doc(db, 'sessions', 'sess_A'), {
        studentUid: 'student1',
        assignmentId: 'assign1',
        sectionId: 'sec_A',
        status: 'active',
        startedAt: serverTimestamp(),
        lastEventAt: serverTimestamp(),
        eventCount: 5,
        expireAt: serverTimestamp(),
      });
    });
  });

  describe('Unauthorized Report & Session Access', () => {
    it('Staff A can read reports in own section (sec_A)', async () => {
      const db = asUser('staffA', 'staff');
      await assertSucceeds(getDoc(doc(db, 'reports', 'rep_A')));
    });

    it('Staff B CANNOT read reports in Staff A section (sec_A)', async () => {
      const db = asUser('staffB', 'staff');
      await assertFails(getDoc(doc(db, 'reports', 'rep_A')));
    });

    it('Staff B CANNOT read sessions in Staff A section (sec_A)', async () => {
      const db = asUser('staffB', 'staff');
      await assertFails(getDoc(doc(db, 'sessions', 'sess_A')));
    });

    it('Staff A can create review for own section session', async () => {
      const db = asUser('staffA', 'staff');
      await assertSucceeds(
        setDoc(doc(db, 'reviews', 'rev_1'), {
          sessionId: 'sess_A',
          sectionId: 'sec_A',
          notes: 'Resolved technical issue',
          outcome: 'resolved',
          reviewedBy: 'staffA',
          reviewedAt: serverTimestamp(),
        }),
      );
    });

    it('Staff B CANNOT create review for Staff A section session', async () => {
      const db = asUser('staffB', 'staff');
      await assertFails(
        setDoc(doc(db, 'reviews', 'rev_unauth'), {
          sessionId: 'sess_A',
          sectionId: 'sec_A',
          notes: 'Unauthorized review',
          outcome: 'resolved',
          reviewedBy: 'staffB',
          reviewedAt: serverTimestamp(),
        }),
      );
    });

    it('Student CANNOT create reviews', async () => {
      const db = asUser('student1', 'student');
      await assertFails(
        setDoc(doc(db, 'reviews', 'rev_student'), {
          sessionId: 'sess_A',
          sectionId: 'sec_A',
          notes: 'Student attempt',
          outcome: 'resolved',
          reviewedBy: 'student1',
          reviewedAt: serverTimestamp(),
        }),
      );
    });
  });
});
