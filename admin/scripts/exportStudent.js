/**
 * Export all data for a student (GDPR/DPDP right of access).
 * Writes a JSON file to the current directory.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=communicationpath-e5990 \
 *   node scripts/exportStudent.js --uid <studentUid>
 */
import { auth, db } from './adminInit.js';
import { writeFileSync } from 'fs';

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

async function main() {
  const { uid } = parseArgs();

  if (!uid) {
    console.error('Usage: --uid <studentUid>');
    process.exit(1);
  }

  const user = await auth.getUser(uid);
  console.log(`Exporting data for: ${user.email ?? uid}`);

  const data = {
    exportedAt: new Date().toISOString(),
    operator: 'admin-script',
    uid,
    email: user.email,
    authRecord: {
      email: user.email,
      displayName: user.displayName,
      createdAt: user.metadata.creationTime,
      lastSignIn: user.metadata.lastSignInTime,
    },
  };

  // user profile
  const userDoc = await db.collection('users').doc(uid).get();
  data.profile = userDoc.exists ? userDoc.data() : null;

  // enrollments
  const enrollSnap = await db.collection('enrollments').where('studentUid', '==', uid).get();
  data.enrollments = enrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // sessions
  const sessionSnap = await db.collection('sessions').where('studentUid', '==', uid).get();
  data.sessions = [];
  for (const sessionDoc of sessionSnap.docs) {
    const session = { id: sessionDoc.id, ...sessionDoc.data(), events: [] };
    const eventsSnap = await db.collection('sessions').doc(sessionDoc.id).collection('events').get();
    session.events = eventsSnap.docs.map((e) => ({ id: e.id, ...e.data() }));
    data.sessions.push(session);
  }

  // progress
  const progressSnap = await db.collection('progress').where('studentUid', '==', uid).get();
  data.progress = progressSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // reports
  const reportsSnap = await db.collection('reports').where('studentUid', '==', uid).get();
  data.reports = reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // consents
  const consentsSnap = await db.collection('consents').where('studentUid', '==', uid).get();
  data.consents = consentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const filename = `student-export-${uid}-${Date.now()}.json`;
  writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`\nExport written to: ${filename}`);
  console.log('IMPORTANT: Handle this file according to your data protection policy.');
  console.log('Delete it securely after sharing with the student. Log the operation in your incident/access log.');
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
