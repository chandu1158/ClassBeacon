/**
 * Revoke all refresh tokens for a user.
 * Use immediately after: account compromise, role change, deactivation.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=communicationpath-e5990 \
 *   node admin/scripts/revokeTokens.js --uid <uid>
 */
import admin, { auth, db } from './adminInit.js';

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
  const { uid, disable } = parseArgs();

  if (!uid) {
    console.error('Usage: --uid <uid> [--disable true]');
    process.exit(1);
  }

  const user = await auth.getUser(uid);
  console.log(`Revoking tokens for: ${user.email ?? uid}`);

  // Revoke all refresh tokens
  await auth.revokeRefreshTokens(uid);
  console.log('Refresh tokens revoked');

  // Optionally disable the account
  if (disable === 'true') {
    await auth.updateUser(uid, { disabled: true });
    // Also set active: false in Firestore
    await db.collection('users').doc(uid).update({
      active: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('Account disabled');
  }

  console.log('Done. Existing sessions will be rejected at next token refresh (up to 1 hour).');
}

main().catch((err) => {
  console.error('Failed to revoke tokens:', err);
  process.exit(1);
});
