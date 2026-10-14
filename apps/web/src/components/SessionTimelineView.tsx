import { useState, type ReactNode, type FormEvent } from 'react';
import type { SessionWithDetails } from '@cb/services/reportExportService';
import { createStaffReview } from '@cb/services/reportExportService';
import type { ReviewOutcome } from '@cb/types/firestore';

interface SessionTimelineViewProps {
  session: SessionWithDetails;
  reviewerUid: string;
  onClose: () => void;
}

export default function SessionTimelineView({
  session,
  reviewerUid,
  onClose,
}: SessionTimelineViewProps): ReactNode {
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<ReviewOutcome>('resolved');
  const [submitting, setSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  const handleReviewSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await createStaffReview(
        session.id,
        session.data.sectionId,
        notes.trim(),
        outcome,
        reviewerUid,
      );
      setReviewMessage('Staff review recorded successfully.');
      setNotes('');
    } catch (err: unknown) {
      console.error('Failed to submit review:', err);
      setReviewMessage(err instanceof Error ? err.message : 'Failed to record review.');
    } finally {
      setSubmitting(false);
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
        zIndex: 1200,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Session Timeline & Review</h2>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>Session ID: {session.id} | Student UID: {session.data.studentUid}</p>
          </div>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Close</button>
        </div>

        {/* Derived Alerts Banner */}
        {session.alerts.length > 0 && (
          <div style={{ background: '#fff3e0', border: '1px solid #ffe0b2', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#e65100', fontSize: '1rem' }}>Derived Signals / Alerts</h3>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#bf360c' }}>
              {session.alerts.map((a, i) => (
                <li key={i}>{a.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Student Self-Reported Explanations */}
        {session.reports.length > 0 && (
          <div style={{ background: '#e1f5fe', border: '1px solid #b3e5fc', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#0277bd', fontSize: '1rem' }}>Student Self-Reported Explanation</h3>
            {session.reports.map((r) => (
              <blockquote key={r.id} style={{ margin: 0, fontStyle: 'italic', color: '#01579b' }}>
                "{r.data.text}"
              </blockquote>
            ))}
          </div>
        )}

        {/* Timeline Events Log */}
        <div style={{ marginBottom: '2rem' }}>
          <h3>Recorded Events Timeline ({session.events.length})</h3>
          {session.events.length === 0 ? (
            <p style={{ color: '#777', fontStyle: 'italic' }}>No events recorded for this session.</p>
          ) : (
            <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}># Seq</th>
                    <th style={{ padding: '0.5rem' }}>Event Type</th>
                    <th style={{ padding: '0.5rem' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {session.events.map((e) => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '0.5rem' }}>{e.data.seq}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <code style={{ background: '#eef', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                          {e.data.type}
                        </code>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{JSON.stringify(e.data.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Staff Review Form */}
        <div style={{ background: '#f8f9fa', padding: '1.25rem', borderRadius: '6px', border: '1px solid #ddd' }}>
          <h3 style={{ marginTop: 0 }}>Record Staff Review / Resolution</h3>
          {reviewMessage && <p style={{ color: '#2e7d32', fontWeight: 600 }}>{reviewMessage}</p>}
          <form onSubmit={(e) => void handleReviewSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              Resolution Outcome:
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as ReviewOutcome)}
                style={{ padding: '0.5rem' }}
              >
                <option value="resolved">Resolved (Normal / Technical cause confirmed)</option>
                <option value="needs_follow_up">Needs Follow Up</option>
                <option value="technical_issue">Technical Issue Confirmed</option>
              </select>
            </label>

            <textarea
              rows={3}
              placeholder="Enter staff notes and review context..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />

            <button
              type="submit"
              disabled={submitting}
              style={{ padding: '0.75rem', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              {submitting ? 'Recording…' : 'Submit Review Record'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
