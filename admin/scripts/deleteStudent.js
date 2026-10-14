/**
 * Delete all Firestore data for a student and optionally delete their Auth account.
 * IRREVERSIBLE. Requires --confirm flag.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=communicationpath-e5990 \
 *   node scripts/deleteStudent.js --uid <studentUid> --confirm yes
 */
import { auth, db } from './adminInit.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

async function deleteCollection(query, batchSize = 100) {
  const snap = await query.limit(batchSize).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size === batchSize) await deleteCollection(query, batchSize);
}

async function main() {
  const { uid, confirm, deleteAuth } = parseArgs();

  if (!uid || confirm !== 'yes') {
    console.error('Usage: --uid <studentUid> --confirm yes [--deleteAuth true]');
    console.error('This operation is IRREVERSIBLE.');
    process.exit(1);
  }

  const user = await auth.getUser(uid);
  console.warn(`⚠️  DELETING all data for: ${user.email ?? uid}`);

  // Delete enrollments
  await deleteCollection(db.collection('enrollments').where('studentUid', '==', uid));
  console.log('Deleted enrollments');

  // Delete progress
  await deleteCollection(db.collection('progress').where('studentUid', '==', uid));
  console.log('Deleted progress');

  // Delete reports
  await deleteCollection(db.collection('reports').where('studentUid', '==', uid));
  console.log('Deleted reports');

  // Delete consents
  await deleteCollection(db.collection('consents').where('studentUid', '==', uid));
  console.log('Deleted consents');

  // Delete sessions and their sub-collections
  const sessionSnap = await db.collection('sessions').where('studentUid', '==', uid).get();
  for (const sessionDoc of sessionSnap.docs) {
    await deleteCollection(db.collection('sessions').doc(sessionDoc.id).collection('events'));
    await sessionDoc.ref.delete();
  }
  console.log(`Deleted ${sessionSnap.size} session(s) and their events`);

  // Delete user document
  await db.collection('users').doc(uid).delete();
  console.log('Deleted user document');

  if (deleteAuth === 'true') {
    await auth.deleteUser(uid);
    console.log('Deleted Auth account');
  } else {
    // Revoke tokens and disable instead
    await auth.revokeRefreshTokens(uid);
    await auth.updateUser(uid, { disabled: true });
    console.log('Auth account disabled and tokens revoked (not deleted — use --deleteAuth true to delete)');
  }

  console.log(`\nDeletion complete for uid: ${uid}`);
  console.log('IMPORTANT: Log this operation in your data protection audit log.');
}

main().catch((err) => {
  console.error('Deletion failed:', err);
  process.exit(1);
});
