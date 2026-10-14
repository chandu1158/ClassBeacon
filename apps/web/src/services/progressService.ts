import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@cb/lib/firebase';
import { api } from '@cb/lib/api';
import type { ProgressDoc } from '@cb/types/firestore';

export interface InitProgressParams {
  assignmentId: string;
  studentUid: string;
  sectionId: string;
  durationSec: number;
  maxRate: number;
  threshold: number;
  chunkSec?: number;
}

export async function getOrCreateProgress(params: InitProgressParams): Promise<ProgressDoc> {
  // First try API
  try {
    const data = await api.get<{
      chunks: Record<string, true>;
      duration_sec: number;
      chunk_sec: number;
      total_chunks: number;
      max_rate: number;
      threshold: number;
    }>(`/progress/${params.assignmentId}`);

    if (data) {
      return {
        studentUid: params.studentUid,
        assignmentId: params.assignmentId,
        sectionId: params.sectionId,
        durationSec: data.duration_sec || params.durationSec,
        chunkSec: data.chunk_sec || 5,
        totalChunks: data.total_chunks || Math.ceil(params.durationSec / 5),
        maxRate: data.max_rate || params.maxRate,
        threshold: data.threshold || params.threshold,
        chunks: data.chunks || {},
        lastBeatAt: new Date() as unknown as Timestamp,
      };
    }
  } catch (err) {
    console.warn('API getOrCreateProgress failed, falling back to Firestore/local:', err);
  }

  // Fallback to Firestore
  try {
    const pid = `${params.assignmentId}_${params.studentUid}`;
    const ref = doc(db, 'progress', pid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data() as ProgressDoc;
    }

    const chunkSec = params.chunkSec ?? 5;
    const totalChunks = Math.ceil(params.durationSec / chunkSec);

    const initialData: ProgressDoc = {
      studentUid: params.studentUid,
      assignmentId: params.assignmentId,
      sectionId: params.sectionId,
      durationSec: params.durationSec,
      chunkSec,
      totalChunks,
      maxRate: params.maxRate,
      threshold: params.threshold,
      chunks: {},
      lastBeatAt: serverTimestamp() as unknown as Timestamp,
    };

    await setDoc(ref, initialData);
    return initialData;
  } catch {
    return {
      studentUid: params.studentUid,
      assignmentId: params.assignmentId,
      sectionId: params.sectionId,
      durationSec: params.durationSec,
      chunkSec: params.chunkSec ?? 5,
      totalChunks: Math.ceil(params.durationSec / (params.chunkSec ?? 5)),
      maxRate: params.maxRate,
      threshold: params.threshold,
      chunks: {},
      lastBeatAt: new Date() as unknown as Timestamp,
    };
  }
}

export async function updateProgressBeat(
  assignmentId: string,
  _studentUid: string,
  chunks: Record<string, true>,
  completedAtDate?: Date,
): Promise<void> {
  // Update via backend MySQL API
  try {
    await api.post('/progress/beat', {
      assignmentId,
      chunks,
      completedAt: completedAtDate ? completedAtDate.toISOString() : undefined,
    });
  } catch (err) {
    console.warn('API updateProgressBeat warning:', err);
  }
}
