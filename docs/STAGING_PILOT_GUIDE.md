# ClassBeacon — Stage 9 Staging & Pilot Deployment Guide

## 1. Staging Firebase Project Setup

Before deploying to production, deploy to a separate staging Firebase project (e.g., `classbeacon-staging`).

### Step 1: Create Staging Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** -> name it `classbeacon-staging`.
3. Confirm project is on the **Spark (no-cost) Plan**.

### Step 2: Configure Staging Environment
1. In `apps/web/.env.local`, set staging parameters:
   ```env
   VITE_FIREBASE_API_KEY=STAGING_API_KEY
   VITE_FIREBASE_AUTH_DOMAIN=classbeacon-staging.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=classbeacon-staging
   VITE_FIREBASE_STORAGE_BUCKET=classbeacon-staging.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=STAGING_SENDER_ID
   VITE_FIREBASE_APP_ID=STAGING_APP_ID
   VITE_USE_EMULATORS=false
   ```

### Step 3: Run Pilot Section (1 Section, 5–10 Students, 1 Week)
1. Provision staff account using admin script:
   ```bash
   FIREBASE_PROJECT_ID=classbeacon-staging node admin/scripts/createUser.js --email teacher@school.edu --role staff --name "Pilot Teacher"
   ```
2. Provision 5–10 student accounts:
   ```bash
   FIREBASE_PROJECT_ID=classbeacon-staging node admin/scripts/createUser.js --email student1@school.edu --role student --name "Student 1"
   ```
3. Staff creates 1 section, enrolls the 5–10 students, and creates 1 assignment.
4. Run pilot for 1 week.
5. Review staff monitoring reports dashboard and verify CSV exports.
