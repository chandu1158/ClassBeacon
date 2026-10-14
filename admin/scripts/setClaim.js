/**
 * Set or change a user's role claim.
 * Only roles 'admin', 'staff', 'student' are accepted.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=communicationpath-e5990 \
 *   node scripts/setClaim.js --uid <uid> --role <staff|student|admin>
 */
import { auth } from './adminInit.js';

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
  const { uid, role } = parseArgs();

  if (!uid || !role) {
    console.error('Usage: --uid <uid> --role <staff|student|admin>');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const user = await auth.getUser(uid);
  console.log(`Setting role for: ${user.email ?? uid}`);

  await auth.setCustomUserClaims(uid, { role });
  console.log(`Role set to: ${role}`);
  console.log('Note: the user must sign out and sign back in for the new claim to take effect.');
  console.log('Or call auth.revokeRefreshTokens(uid) to force immediate re-authentication.');
}

main().catch((err) => {
  console.error('Failed to set claim:', err);
  process.exit(1);
});
