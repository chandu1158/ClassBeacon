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
  updateDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

const RULES_PATH = '../../firebase/firestore.rules';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'classbeacon-stage4-test',
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

describe('Stage 4 Exit Gate Progress Security Rules', () => {
  beforeEach(async () => {
    // Seed enrollment for student1 in sec_A
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, 'enrollments', 'sec_A_student1'), {
        sectionId: 'sec_A',
        studentUid: 'student1',
        createdAt: serverTimestamp(),
      });
    });
  });

  describe('Progress Initialization (Create)', () => {
    it('Enrolled student can initialize progress doc with correct ID', async () => {
      const db = asUser('student1', 'student');
      await assertSucceeds(
        setDoc(doc(db, 'progress', 'assign1_student1'), {
          studentUid: 'student1',
          assignmentId: 'assign1',
          sectionId: 'sec_A',
          durationSec: 100,
          chunkSec: 5,
          totalChunks: 20,
          maxRate: 1.5,
          threshold: 0.8,
          chunks: {},
          lastBeatAt: serverTimestamp(),
        }),
      );
    });

    it('Student cannot initialize progress doc with wrong ID format', async () => {
      const db = asUser('student1', 'student');
      await assertFails(
        setDoc(doc(db, 'progress', 'wrong_id'), {
          studentUid: 'student1',
          assignmentId: 'assign1',
          sectionId: 'sec_A',
          durationSec: 100,
          chunkSec: 5,
          totalChunks: 20,
          maxRate: 1.5,
          threshold: 0.8,
          chunks: {},
          lastBeatAt: serverTimestamp(),
        }),
      );
    });

    it('Unenrolled student cannot initialize progress doc', async () => {
      const db = asUser('student2', 'student'); // Not enrolled in sec_A
      await assertFails(
        setDoc(doc(db, 'progress', 'assign1_student2'), {
          studentUid: 'student2',
          assignmentId: 'assign1',
          sectionId: 'sec_A',
          durationSec: 100,
          chunkSec: 5,
          totalChunks: 20,
          maxRate: 1.5,
          threshold: 0.8,
          chunks: {},
          lastBeatAt: serverTimestamp(),
        }),
      );
    });
  });

  describe('Progress Beat Updates & Immutability', () => {
    beforeEach(async () => {
      // Seed existing progress document with 2 watched chunks
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore() as unknown as Firestore;
        await setDoc(doc(db, 'progress', 'assign1_student1'), {
          studentUid: 'student1',
          assignmentId: 'assign1',
          sectionId: 'sec_A',
          durationSec: 100,
          chunkSec: 5,
          totalChunks: 20,
          maxRate: 1.5,
          threshold: 0.8,
          chunks: { '0': true, '1': true },
          lastBeatAt: serverTimestamp(),
        });
      });
    });

    it('Student cannot modify immutable fields (studentUid, assignmentId, durationSec)', async () => {
      const db = asUser('student1', 'student');
      await assertFails(
        updateDoc(doc(db, 'progress', 'assign1_student1'), {
          durationSec: 50, // forbidden modification
          lastBeatAt: serverTimestamp(),
        }),
      );
    });

    it('Student cannot remove previously recorded chunks', async () => {
      const db = asUser('student1', 'student');
      await assertFails(
        updateDoc(doc(db, 'progress', 'assign1_student1'), {
          chunks: { '0': true }, // chunk '1' was removed
          lastBeatAt: serverTimestamp(),
        }),
      );
    });

    it('Student cannot set completedAt if chunk threshold is not met (16 of 20 needed for 80%)', async () => {
      const db = asUser('student1', 'student');
      await assertFails(
        updateDoc(doc(db, 'progress', 'assign1_student1'), {
          chunks: { '0': true, '1': true, '2': true }, // Only 3 chunks (15s out of 80s threshold)
          lastBeatAt: serverTimestamp(),
          completedAt: serverTimestamp(), // Forbidden early completion
        }),
      );
    });
  });
});
