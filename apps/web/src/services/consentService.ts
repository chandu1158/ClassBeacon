import { api } from '@cb/lib/api';

export async function hasAcceptedConsent(studentUid: string, noticeVersion: string): Promise<boolean> {
  // 1. Try MySQL API first
  try {
    const res = await api.get<{ accepted: boolean }>(`/consents/check?noticeVersion=${encodeURIComponent(noticeVersion)}`);
    if (res && typeof res.accepted === 'boolean') {
      return res.accepted;
    }
  } catch (err) {
    console.warn('API hasAcceptedConsent check failed, trying Firestore:', err);
  }

  // 2. Check localStorage fallback
  const localConsent = localStorage.getItem(`consent_${studentUid}_${noticeVersion}`);
  return localConsent === 'true';
}

export async function acceptConsent(studentUid: string, noticeVersion: string): Promise<void> {
  // 1. Save to localStorage immediately
  try {
    localStorage.setItem(`consent_${studentUid}_${noticeVersion}`, 'true');
  } catch {}

  // 2. Save via MySQL API
  try {
    await api.post('/consents/accept', { noticeVersion });
  } catch (apiErr) {
    console.warn('API acceptConsent failed:', apiErr);
  }
}
