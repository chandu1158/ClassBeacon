import { useState, type ReactNode } from 'react';
import { acceptConsent } from '@cb/services/consentService';
import { NOTICE_VERSION, RETENTION_DAYS } from '@cb/lib/constants';

interface ConsentNoticeModalProps {
  studentUid: string;
  onAccepted: () => void;
}

export default function ConsentNoticeModal({ studentUid, onAccepted }: ConsentNoticeModalProps): ReactNode {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await acceptConsent(studentUid, NOTICE_VERSION);
      onAccepted();
    } catch (err: unknown) {
      console.error('Failed to save consent:', err);
      setError(err instanceof Error ? err.message : 'Failed to record consent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '2rem',
          maxWidth: '560px',
          width: '100%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        <h2 id="consent-title" style={{ marginTop: 0, color: '#1a73e8' }}>
          ClassBeacon Monitoring Notice (v{NOTICE_VERSION})
        </h2>

        <div id="consent-body" style={{ color: '#333', fontSize: '0.95rem', lineHeight: '1.5' }}>
          <p>
            <strong>ClassBeacon records:</strong> which parts of a video you play, pauses and seeks, whether the lesson tab is visible, and connection interruptions.
          </p>
          <p>
            It <strong>does not</strong> use your camera, microphone, screen, or keyboard.
          </p>
          <p>
            Your teachers for this section can see this recorded data. Data is kept for <strong>{RETENTION_DAYS} days</strong>. You can ask for a copy or for deletion by contacting your course administrator.
          </p>
          <p style={{ fontStyle: 'italic', background: '#f5f5f5', padding: '0.75rem', borderRadius: '4px' }}>
            Interruptions can have normal causes such as incoming phone calls or poor connections; you can explain any interruption at any time using the Report button during a lesson.
          </p>
        </div>

        {error && (
          <p role="alert" style={{ color: '#c62828', fontSize: '0.9rem' }}>
            {error}
          </p>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button
            onClick={() => void handleAccept()}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#1a73e8',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Recording Acceptance…' : 'I Understand & Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
