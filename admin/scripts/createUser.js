/**
 * Create a user account and set their role claim.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=communicationpath-e5990 \
 *   node admin/scripts/createUser.js --email teacher@school.edu --role staff --name "Jane Smith"
 */
import { auth, db, FieldValue } from './adminInit.js';
import crypto from 'crypto';

const VALID_ROLES = ['admin', 'staff', 'student'];

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
  const { email, role, name, password } = parseArgs();

  if (!email || !role || !name) {
    console.error('Usage: --email <email> --role <staff|student|admin> --name "<display name>" [--password <password>]');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const generatedPassword = password ?? crypto.randomUUID().slice(0, 16);

  // Create the Auth account
  const userRecord = await auth.createUser({
    email,
    password: generatedPassword,
    displayName: name,
    emailVerified: false,
  });

  console.log(`Created user: ${userRecord.uid} (${email})`);

  // Set the role claim
  await auth.setCustomUserClaims(userRecord.uid, { role });
  console.log(`Set role claim: ${role}`);

  // Create the Firestore user document
  await db.collection('users').doc(userRecord.uid).set({
    displayName: name,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log('Created Firestore user document');

  console.log('\n--- User created successfully ---');
  console.log(`UID:      ${userRecord.uid}`);
  console.log(`Email:    ${email}`);
  console.log(`Role:     ${role}`);
  console.log(`Password: ${generatedPassword}`);
  console.log('----------------------------------');
}

main().catch((err) => {
  console.error('Failed to create user:', err);
  process.exit(1);
});
