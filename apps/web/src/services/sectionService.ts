import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@cb/lib/firebase';
import type { SectionDoc, EnrollmentDoc } from '@cb/types/firestore';

export async function createSection(name: string, ownerUid: string, staffUids: string[] = []): Promise<string> {
  const sectionRef = doc(collection(db, 'sections'));
  const data: SectionDoc = {
    name,
    ownerUid,
    staffUids,
    createdAt: serverTimestamp() as unknown as import('firebase/firestore').Timestamp,
  };
  await setDoc(sectionRef, data);
  return sectionRef.id;
}

export async function getStaffSections(staffUid: string): Promise<Array<{ id: string; data: SectionDoc }>> {
  // Query sections where staffUid is owner OR in staffUids
  const qOwner = query(collection(db, 'sections'), where('ownerUid', '==', staffUid));
  const snapOwner = await getDocs(qOwner);

  const qStaff = query(collection(db, 'sections'), where('staffUids', 'array-contains', staffUid));
  const snapStaff = await getDocs(qStaff);

  const map = new Map<string, SectionDoc>();
  snapOwner.docs.forEach((d) => { map.set(d.id, d.data() as SectionDoc); });
  snapStaff.docs.forEach((d) => { map.set(d.id, d.data() as SectionDoc); });

  return Array.from(map.entries()).map(([id, data]) => ({ id, data }));
}

export async function updateSection(sectionId: string, name: string, staffUids: string[]): Promise<void> {
  const ref = doc(db, 'sections', sectionId);
  await updateDoc(ref, { name, staffUids });
}

export async function enrollStudent(sectionId: string, studentUid: string): Promise<void> {
  const enrollmentId = `${sectionId}_${studentUid}`;
  const ref = doc(db, 'enrollments', enrollmentId);
  const data: EnrollmentDoc = {
    sectionId,
    studentUid,
    createdAt: serverTimestamp() as unknown as import('firebase/firestore').Timestamp,
  };
  await setDoc(ref, data);
}

export async function removeEnrollment(sectionId: string, studentUid: string): Promise<void> {
  const enrollmentId = `${sectionId}_${studentUid}`;
  const ref = doc(db, 'enrollments', enrollmentId);
  await deleteDoc(ref);
}

export async function getSectionEnrollments(sectionId: string): Promise<Array<{ id: string; data: EnrollmentDoc }>> {
  const q = query(collection(db, 'enrollments'), where('sectionId', '==', sectionId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as EnrollmentDoc }));
}
