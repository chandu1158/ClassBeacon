import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@cb/lib/firebase';
import type { VideoDoc } from '@cb/types/firestore';

export async function createVideo(
  title: string,
  sourceUrl: string,
  durationSec: number,
  ownerUid: string,
): Promise<string> {
  if (!sourceUrl.startsWith('https://')) {
    throw new Error('Video source URL must use HTTPS.');
  }
  const videoRef = doc(collection(db, 'videos'));
  const data: VideoDoc = {
    title,
    sourceUrl,
    durationSec,
    ownerUid,
    createdAt: serverTimestamp() as unknown as import('firebase/firestore').Timestamp,
  };
  await setDoc(videoRef, data);
  return videoRef.id;
}

export async function getStaffVideos(staffUid: string): Promise<Array<{ id: string; data: VideoDoc }>> {
  const q = query(collection(db, 'videos'), where('ownerUid', '==', staffUid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as VideoDoc }));
}

export async function updateVideo(videoId: string, title: string, durationSec: number): Promise<void> {
  const ref = doc(db, 'videos', videoId);
  await updateDoc(ref, { title, durationSec });
}
