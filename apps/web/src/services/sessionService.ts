import { api } from '@cb/lib/api';
import type { EventType } from '@cb/lib/constants';
import type { SessionStatus } from '@cb/types/firestore';

export async function createSession(
  assignmentId: string,
  _studentUid: string,
  sectionId: string,
): Promise<string> {
  try {
    const res = await api.post<{ id: number }>('/sessions', {
      assignmentId,
      sectionId,
    });
    if (res?.id) {
      return String(res.id);
    }
  } catch (err) {
    console.warn('API createSession failed, falling back to local session ID:', err);
  }
  return `sess_${Date.now()}`;
}

export async function updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
  try {
    await api.put(`/sessions/${sessionId}/status`, { status });
  } catch {
    // ignore offline error
  }
}

export async function logSessionEvent(
  sessionId: string,
  eventType: EventType,
  seq: number,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await api.post(`/sessions/${sessionId}/events`, {
      type: eventType,
      seq,
      details,
    });
  } catch {
    // ignore offline error
  }
}
