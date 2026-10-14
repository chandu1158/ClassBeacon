import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@cb/lib/firebase';
import type { AssignmentDoc, AssignmentPolicy, EnrollmentDoc } from '@cb/types/firestore';

export interface CreateAssignmentParams {
  sectionId: string;
  videoId: string;
  title: string;
  sourceUrl: string;
  durationSec: number;
  completionThreshold: number; // e.g. 0.8
  policy: AssignmentPolicy;
  dueAt: Date | null;
  createdBy: string;
}

export async function createAssignment(params: CreateAssignmentParams): Promise<string> {
  if (!params.sourceUrl.startsWith('https://')) {
    throw new Error('Assignment media URL must use HTTPS.');
  }

  const assignmentRef = doc(collection(db, 'assignments'));
  const data: AssignmentDoc = {
    sectionId: params.sectionId,
    videoId: params.videoId,
    title: params.title,
    sourceUrl: params.sourceUrl, // Snapshot from video library doc
    durationSec: params.durationSec, // Snapshot from video library doc
    completionThreshold: params.completionThreshold,
    policy: params.policy,
    dueAt: params.dueAt ? Timestamp.fromDate(params.dueAt) : null,
    createdBy: params.createdBy,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };

  await setDoc(assignmentRef, data);
  return assignmentRef.id;
}

export async function getSectionAssignments(sectionId: string): Promise<Array<{ id: string; data: AssignmentDoc }>> {
  const q = query(collection(db, 'assignments'), where('sectionId', '==', sectionId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as AssignmentDoc }));
}

/**
 * Student Query Flow (Stage 3):
 * 1. Fetch own enrollments: `where('studentUid', '==', studentUid)`
 * 2. For each section enrolled, query assignments: `where('sectionId', '==', sectionId)`
 * Security rules check `isEnrolled(resource.data.sectionId)` via `exists(/databases/.../enrollments/$(sectionId + '_' + request.auth.uid))`
 */
export async function getStudentEnrollments(studentUid: string): Promise<Array<{ id: string; data: EnrollmentDoc }>> {
  const q = query(collection(db, 'enrollments'), where('studentUid', '==', studentUid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as EnrollmentDoc }));
}

export async function getStudentAssignmentsForSection(sectionId: string): Promise<Array<{ id: string; data: AssignmentDoc }>> {
  const q = query(collection(db, 'assignments'), where('sectionId', '==', sectionId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as AssignmentDoc }));
}

export async function updateAssignment(
  assignmentId: string,
  updates: {
    title?: string;
    completionThreshold?: number;
    policy?: AssignmentPolicy;
    dueAt?: Date | null;
  },
): Promise<void> {
  const ref = doc(db, 'assignments', assignmentId);
  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) payload['title'] = updates.title;
  if (updates.completionThreshold !== undefined) payload['completionThreshold'] = updates.completionThreshold;
  if (updates.policy !== undefined) payload['policy'] = updates.policy;
  if (updates.dueAt !== undefined) payload['dueAt'] = updates.dueAt ? Timestamp.fromDate(updates.dueAt) : null;

  await updateDoc(ref, payload);
}
