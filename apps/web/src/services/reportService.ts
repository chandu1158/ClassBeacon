import { api } from '@cb/lib/api';

export async function submitStudentReport(
  sessionId: string | null,
  _studentUid: string,
  sectionId: string,
  text: string,
  assignmentId?: string,
): Promise<string> {
  if (!text.trim() || text.length > 2000) {
    throw new Error('Report text must be between 1 and 2000 characters.');
  }

  // Submit to backend API so teacher can see it in MySQL database
  try {
    const res = await api.post<{ id: number }>('/reports', {
      sessionId: sessionId && !isNaN(Number(sessionId)) ? Number(sessionId) : null,
      sectionId: Number(sectionId),
      assignmentId: assignmentId ? Number(assignmentId) : null,
      text: text.trim(),
    });
    if (res?.id) {
      return String(res.id);
    }
  } catch (err) {
    console.warn('API report submission warning:', err);
    throw err;
  }

  return 'rep_local';
}
