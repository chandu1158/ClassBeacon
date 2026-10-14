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
  getDocs,
  query,
  setDoc,
  collection,
  where,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

const RULES_PATH = '../../firebase/firestore.rules';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'classbeacon-stage3-test',
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

describe('Stage 3 Exit Gate Security Rules Tests', () => {
  beforeEach(async () => {
    // Seed Section A owned by staffA
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, 'sections', 'sec_A'), {
        name: 'Physics 101',
        ownerUid: 'staffA',
        staffUids: [],
        createdAt: serverTimestamp(),
      });

      // Seed Section B owned by staffB
      await setDoc(doc(db, 'sections', 'sec_B'), {
        name: 'Chemistry 101',
        ownerUid: 'staffB',
        staffUids: [],
        createdAt: serverTimestamp(),
      });

      // Seed Enrollment: student1 is enrolled in sec_A ONLY
      await setDoc(doc(db, 'enrollments', 'sec_A_student1'), {
        sectionId: 'sec_A',
        studentUid: 'student1',
        createdAt: serverTimestamp(),
      });

      // Seed Assignment in sec_A
      await setDoc(doc(db, 'assignments', 'assign_A1'), {
        sectionId: 'sec_A',
        videoId: 'vid1',
        title: 'Physics Lesson 1',
        sourceUrl: 'https://example.com/phys1.mp4',
        durationSec: 600,
        completionThreshold: 0.8,
        policy: { sequential: true, pauseOnHidden: true, hiddenAlertSec: 60, maxRate: 1.5 },
        dueAt: null,
        createdBy: 'staffA',
        createdAt: serverTimestamp(),
      });

      // Seed Assignment in sec_B
      await setDoc(doc(db, 'assignments', 'assign_B1'), {
        sectionId: 'sec_B',
        videoId: 'vid2',
        title: 'Chemistry Lesson 1',
        sourceUrl: 'https://example.com/chem1.mp4',
        durationSec: 900,
        completionThreshold: 0.8,
        policy: { sequential: false, pauseOnHidden: false, hiddenAlertSec: 60, maxRate: 2.0 },
        dueAt: null,
        createdBy: 'staffB',
        createdAt: serverTimestamp(),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Cross-section Staff Denial
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Cross-section Staff Denial', () => {
    it('Staff A cannot read Staff B section', async () => {
      const db = asUser('staffA', 'staff');
      await assertFails(getDoc(doc(db, 'sections', 'sec_B')));
    });

    it('Staff A cannot create an assignment in Staff B section', async () => {
      const db = asUser('staffA', 'staff');
      await assertFails(
        setDoc(doc(db, 'assignments', 'assign_B2'), {
          sectionId: 'sec_B',
          videoId: 'vid1',
          title: 'Unauthorized Assignment',
          sourceUrl: 'https://example.com/unauth.mp4',
          durationSec: 300,
          completionThreshold: 0.8,
          policy: { sequential: true, pauseOnHidden: true, hiddenAlertSec: 60, maxRate: 1.5 },
          dueAt: null,
          createdBy: 'staffA',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('Staff A cannot enroll a student into Staff B section', async () => {
      const db = asUser('staffA', 'staff');
      await assertFails(
        setDoc(doc(db, 'enrollments', 'sec_B_student1'), {
          sectionId: 'sec_B',
          studentUid: 'student1',
          createdAt: serverTimestamp(),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Student Assignment Access (Enrolled vs Unenrolled)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Student Assignment Access & Enrolment Scope', () => {
    it('Enrolled student (student1) can read assignment in sec_A', async () => {
      const db = asUser('student1', 'student');
      await assertSucceeds(getDoc(doc(db, 'assignments', 'assign_A1')));
    });

    it('Unenrolled student (student1) CANNOT read assignment in sec_B', async () => {
      const db = asUser('student1', 'student');
      await assertFails(getDoc(doc(db, 'assignments', 'assign_B1')));
    });

    it('Student cannot create assignments anywhere', async () => {
      const db = asUser('student1', 'student');
      await assertFails(
        setDoc(doc(db, 'assignments', 'assign_student_created'), {
          sectionId: 'sec_A',
          videoId: 'vid1',
          title: 'Forged Assignment',
          sourceUrl: 'https://example.com/forged.mp4',
          durationSec: 100,
          completionThreshold: 0.1,
          policy: { sequential: false, pauseOnHidden: false, hiddenAlertSec: 60, maxRate: 3.0 },
          dueAt: null,
          createdBy: 'student1',
          createdAt: serverTimestamp(),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Query Constraints Match Rules
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Query Constraints Match Rules', () => {
    it('Student querying own enrollments matches security rules', async () => {
      const db = asUser('student1', 'student');
      const q = query(collection(db, 'enrollments'), where('studentUid', '==', 'student1'));
      await assertSucceeds(getDocs(q));
    });

    it('Student querying assignments for enrolled section matches security rules', async () => {
      const db = asUser('student1', 'student');
      const q = query(collection(db, 'assignments'), where('sectionId', '==', 'sec_A'));
      await assertSucceeds(getDocs(q));
    });

    it('Student querying assignments for unenrolled section fails security rules', async () => {
      const db = asUser('student1', 'student');
      const q = query(collection(db, 'assignments'), where('sectionId', '==', 'sec_B'));
      await assertFails(getDocs(q));
    });
  });
});
