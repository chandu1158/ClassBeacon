# ClassBeacon — Development Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Firebase CLI: `npm install -g firebase-tools`
- Java 11+ (required by Firebase emulators)
- Optional: gitleaks (for pre-commit secret scanning)

## First-time setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd ClassBeacon

# 2. Copy env file and fill in real values
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local — real values stay local, never committed

# 3. Install web dependencies
npm install --prefix apps/web

# 4. Install test dependencies
npm install --prefix tests

# 5. Install admin dependencies (optional, only if you run admin scripts)
npm install --prefix admin

# 6. Log in to Firebase
firebase login
```

## Running the emulators

```bash
npm run emulators
# Opens the Emulator UI at http://localhost:4000
```

## Running the dev server (with emulators)

```bash
# In terminal 1:
npm run emulators

# In terminal 2:
npm run dev --prefix apps/web
```

## Running tests

```bash
# Unit tests (no emulator needed)
npm run test --prefix apps/web

# Rules tests (requires Firestore emulator running on port 8080)
npm run emulators
npm test --prefix tests
```

## Admin scripts

All admin scripts require Firebase Admin SDK access.
In development, use emulators:

```bash
# Set emulator env vars
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_PROJECT_ID=communicationpath-e5990

# Create a staff user
node admin/scripts/createUser.js --email teacher@example.com --role staff --name "Jane Smith"

# Set a role
node admin/scripts/setClaim.js --uid <uid> --role student

# Revoke tokens (on compromise)
node admin/scripts/revokeTokens.js --uid <uid> --disable true
```

## Security rules

Rules live in `firebase/firestore.rules`.
**Never edit rules directly in the Firebase console.** Always:
1. Edit the `.rules` file
2. Add a failing test first
3. Run the emulator suite to confirm it passes
4. Deploy only after approval

## Known limitations

See the plan document: `ClassBeacon Secure Implementation and Monitoring Plan.md`
