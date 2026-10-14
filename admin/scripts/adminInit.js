/**
 * Admin SDK initializer.
 * Uses Application Default Credentials (ADC) — never commits a key file.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const app = getApps().length === 0
  ? initializeApp({
      projectId: process.env['FIREBASE_PROJECT_ID'] ?? 'communicationpath-e5990',
    })
  : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export { FieldValue };
export default app;
