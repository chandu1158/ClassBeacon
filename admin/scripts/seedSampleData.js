/**
 * Seed Sample Data Script for ClassBeacon
 * Populates Firestore with sample users, section, enrollment, video, and assignment.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=communicationpath-e5990 node admin/scripts/seedSampleData.js
 *
 * For Emulators:
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   FIREBASE_PROJECT_ID=communicationpath-e5990 \
 *   node admin/scripts/seedSampleData.js
 */
import { auth, db, FieldValue } from './adminInit.js';

async function seed() {
  console.log('🌱 Starting ClassBeacon Sample Data Seeding…');

  const staffEmail = 'staff@classbeacon.edu';
  const studentEmail = 'student@classbeacon.edu';
  const password = 'Password123!';

  // 1. Get or create Staff Auth User
  let staffUid = '';
  try {
    const staffUser = await auth.getUserByEmail(staffEmail);
    staffUid = staffUser.uid;
    console.log(`Found existing staff user: ${staffUid}`);
  } catch {
    const staffUser = await auth.createUser({
      email: staffEmail,
      password,
      displayName: 'Professor Smith',
    });
    staffUid = staffUser.uid;
    await auth.setCustomUserClaims(staffUid, { role: 'staff' });
    console.log(`Created staff user: ${staffUid}`);
  }

  // 2. Get or create Student Auth User
  let studentUid = '';
  try {
    const studentUser = await auth.getUserByEmail(studentEmail);
    studentUid = studentUser.uid;
    console.log(`Found existing student user: ${studentUid}`);
  } catch {
    const studentUser = await auth.createUser({
      email: studentEmail,
      password,
      displayName: 'Alice Johnson',
    });
    studentUid = studentUser.uid;
    await auth.setCustomUserClaims(studentUid, { role: 'student' });
    console.log(`Created student user: ${studentUid}`);
  }

  // 3. Create Firestore User Documents
  await db.collection('users').doc(staffUid).set({
    displayName: 'Professor Smith',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('✓ Created users/staff profile');

  await db.collection('users').doc(studentUid).set({
    displayName: 'Alice Johnson',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('✓ Created users/student profile');

  // 4. Create Sample Section
  const sectionId = 'sec_sample_cs101';
  await db.collection('sections').doc(sectionId).set({
    name: 'CS 101: Web Security & Monitoring Principles',
    ownerUid: staffUid,
    staffUids: [],
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ Created sections/${sectionId}`);

  // 5. Create Sample Enrollment
  const enrollmentId = `${sectionId}_${studentUid}`;
  await db.collection('enrollments').doc(enrollmentId).set({
    sectionId,
    studentUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ Created enrollments/${enrollmentId}`);

  // 6. Create Sample Video Snapshot
  const videoId = 'vid_sample_websec';
  await db.collection('videos').doc(videoId).set({
    title: 'Lesson 1: Trust Boundaries and Security Rules',
    sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    durationSec: 15,
    ownerUid: staffUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ Created videos/${videoId}`);

  // 7. Create Sample Assignment (copied snapshot for student view)
  const assignmentId = 'assign_sample_lesson1';
  await db.collection('assignments').doc(assignmentId).set({
    sectionId,
    videoId,
    title: 'Lesson 1: Trust Boundaries and Security Rules',
    sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    durationSec: 15,
    completionThreshold: 0.8,
    policy: {
      sequential: true,
      pauseOnHidden: true,
      hiddenAlertSec: 60,
      maxRate: 1.5,
    },
    dueAt: null,
    createdBy: staffUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`✓ Created assignments/${assignmentId}`);

  console.log('\n🎉 Seeding Complete!');
  console.log('--------------------------------------------------');
  console.log(`Staff Credentials:   ${staffEmail} / ${password}`);
  console.log(`Student Credentials: ${studentEmail} / ${password}`);
  console.log('--------------------------------------------------');
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
