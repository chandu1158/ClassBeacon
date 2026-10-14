import { useState, useEffect, useRef, type ReactNode, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@cb/lib/firebase';
import { useAuth } from '@cb/contexts/AuthContext';
import CustomVideoPlayer from '@cb/components/CustomVideoPlayer';
import ConsentNoticeModal from '@cb/components/ConsentNoticeModal';
import { hasAcceptedConsent } from '@cb/services/consentService';
import { createSession, updateSessionStatus } from '@cb/services/sessionService';
import { EventCollector } from '@cb/lib/eventCollector';
import { getOrCreateProgress } from '@cb/services/progressService';
import { submitStudentReport } from '@cb/services/reportService';
import { NOTICE_VERSION } from '@cb/lib/constants';
import { api } from '@cb/lib/api';
import type { AssignmentDoc, ProgressDoc } from '@cb/types/firestore';
import { getProctorAI, type ProctorAIInstance, type ProctorStatus } from '@cb/lib/proctor-ai';

export default function LessonPlayerPage(): ReactNode {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
  const [progress, setProgress] = useState<ProgressDoc | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [eventCollector, setEventCollector] = useState<EventCollector | null>(null);

  // Proctor AI states and refs
  const webcamRef = useRef<HTMLVideoElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const proctorRef = useRef<ProctorAIInstance | null>(null);
  const isCompletedRef = useRef<boolean>(false);
  const currentProgressRef = useRef<{ percent: number; currentTime: number }>({ percent: 0, currentTime: 0 });

  const [proctorStatus, setProctorStatus] = useState<ProctorStatus>({ code: 'idle', message: 'Awaiting camera consent…' });
  const [latestAlert, setLatestAlert] = useState<string | null>(null);
  const [snapshotCount, setSnapshotCount] = useState<number>(0);
  const CONFIDENCE_THRESHOLD = 0.50;

  // Report Modal states
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventCollectorRef = useRef<EventCollector | null>(null);

  useEffect(() => {
    if (assignmentId && user?.user_id) {
      void initLesson(assignmentId, user.user_id);
    }
  }, [assignmentId, user]);

  // Handle session cleanup on unmount: mark interrupted if not completed
  useEffect(() => {
    return () => {
      if (eventCollectorRef.current) {
        void eventCollectorRef.current.emit('session_end');
      }

      if (proctorRef.current) {
        proctorRef.current.stop();
        proctorRef.current = null;
      }

      if (sessionId) {
        if (!isCompletedRef.current) {
          // Incomplete session - record as interrupted
          void api.put(`/sessions/${sessionId}/status`, {
            status: 'interrupted',
            reason: 'Student left video lesson before reaching completion threshold.',
          }).catch(() => {});
        } else {
          void updateSessionStatus(sessionId, 'completed').catch(() => {});
        }
      }
    };
  }, [sessionId]);

  const initLesson = async (assId: string, uid: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Check consent first
      const accepted = await hasAcceptedConsent(uid, NOTICE_VERSION);
      if (!accepted) {
        setNeedsConsent(true);
      } else {
        setConsentAccepted(true);
      }

      // Fetch assignment from API first
      let assData: AssignmentDoc | null = null;
      try {
        const apiAss = await api.get<{
          id: number;
          section_id?: number;
          sectionId?: string;
          title: string;
          source_url?: string;
          sourceUrl?: string;
          duration_sec?: number;
          durationSec?: number;
          completion_threshold?: number;
          completionThreshold?: number;
          policy?: {
            sequential: boolean;
            pauseOnHidden: boolean;
            hiddenAlertSec: number;
            maxRate: number;
          };
        }>(`/assignments/${assId}`);

        if (apiAss) {
          assData = {
            sectionId: String(apiAss.section_id || apiAss.sectionId || ''),
            videoId: String(apiAss.id),
            title: apiAss.title,
            sourceUrl: apiAss.source_url || apiAss.sourceUrl || '',
            durationSec: apiAss.duration_sec || apiAss.durationSec || 300,
            completionThreshold: apiAss.completion_threshold || apiAss.completionThreshold || 0.8,
            policy: apiAss.policy || {
              sequential: true,
              pauseOnHidden: true,
              hiddenAlertSec: 60,
              maxRate: 1.5,
            },
            dueAt: null,
            createdBy: '',
            createdAt: new Date() as unknown as import('firebase/firestore').Timestamp,
          };
        }
      } catch (apiErr) {
        console.warn('API fetch assignment failed, trying Firestore:', apiErr);
      }

      if (!assData) {
        // Fallback to Firestore (safely catch offline error)
        try {
          const assRef = doc(db, 'assignments', assId);
          const assSnap = await getDoc(assRef);
          if (assSnap.exists()) {
            assData = assSnap.data() as AssignmentDoc;
          }
        } catch (fErr) {
          console.warn('Firestore fallback fetch failed (offline/unconfigured):', fErr);
        }
      }

      if (!assData) {
        setError('Assignment lesson not found or unavailable.');
        return;
      }

      setAssignment(assData);

      // Fetch progress
      const prog = await getOrCreateProgress({
        assignmentId: assId,
        studentUid: uid,
        sectionId: assData.sectionId,
        durationSec: assData.durationSec,
        maxRate: assData.policy.maxRate,
        threshold: assData.completionThreshold,
      });
      setProgress(prog);

      // Create Session
      const sessId = await createSession(assId, uid, assData.sectionId);
      setSessionId(sessId);

      const collector = new EventCollector(sessId);
      setEventCollector(collector);
      eventCollectorRef.current = collector;

      void collector.emit('session_start');
    } catch (err: unknown) {
      console.error('Failed to initialize lesson:', err);
      setError(err instanceof Error ? err.message : 'Failed to load lesson.');
    } finally {
      setLoading(false);
    }
  };

  const handleConsentAccepted = (): void => {
    setNeedsConsent(false);
    setConsentAccepted(true);
  };

  // Initialize and run ProctorAI when consent is accepted and refs are mounted
  useEffect(() => {
    if (!consentAccepted || !sessionId || !assignment || !user?.user_id) return;
    if (!webcamRef.current || !hudCanvasRef.current) return;

    let isCancelled = false;

    const setupProctor = async (): Promise<void> => {
      try {
        const token = localStorage.getItem('cb_token');
        const proctor = getProctorAI({
          videoElement: webcamRef.current,
          hudCanvas: hudCanvasRef.current,
          studentId: user.user_id,
          sessionId: sessionId,
          assignmentId: assignmentId || '',
          sectionId: assignment.sectionId,
          token: token,
          config: {
            modelBase: 'lite_mobilenet_v2',
            inferenceIntervalMs: 350,
            confidenceThreshold: CONFIDENCE_THRESHOLD,
            consecutiveFramesRequired: 2,
            absenceThresholdMs: 3000,
            apiEndpoint: 'http://localhost:5000/api/proctor_log',
          },
          onStatusChange: (status) => {
            if (!isCancelled) setProctorStatus(status);
          },
          onEvent: (evt) => {
            if (!isCancelled) {
              setSnapshotCount((prev) => prev + 1);
              let msg = evt.details?.label || `Observable flag: ${evt.type}`;
              if (
                evt.type === 'second_device' ||
                evt.details?.detected_object === 'cell phone' ||
                evt.details?.detected_object === 'laptop' ||
                evt.details?.detected_object === 'tv'
              ) {
                msg = '⚠️ Other devices are detected';
              } else if (evt.type === 'multiple_faces' || (evt.details?.count && evt.details.count > 1)) {
                msg = '⚠️ Multiple persons detected';
              }
              setLatestAlert(msg);
              setTimeout(() => {
                if (!isCancelled) setLatestAlert(null);
              }, 4000);
            }
          },
          getProgress: () => currentProgressRef.current,
        });

        if (!proctor) {
          setProctorStatus({ code: 'unavailable', message: 'ProctorAI library unavailable.' });
          return;
        }

        proctorRef.current = proctor;
        await proctor.init();
        if (!isCancelled) {
          proctor.start();
        }
      } catch (err: unknown) {
        console.error('Proctor initialization failed:', err);
        if (!isCancelled) {
          setProctorStatus({
            code: 'error',
            message: err instanceof Error ? err.message : 'Webcam or AI model failed to start.',
          });
        }
      }
    };

    void setupProctor();

    return () => {
      isCancelled = true;
      if (proctorRef.current) {
        proctorRef.current.stop();
        proctorRef.current = null;
      }
    };
  }, [consentAccepted, sessionId, assignment, user]);

  const handleProgressUpdate = (chunks: Record<string, true>, isCompleted: boolean): void => {
    const chunkCount = Object.keys(chunks).length;
    const dur = assignment?.durationSec || 300;
    const percent = Math.min(100, Math.round(((chunkCount * 5) / dur) * 100));
    currentProgressRef.current = {
      percent,
      currentTime: chunkCount * 5,
    };

    if (isCompleted) {
      isCompletedRef.current = true;
      if (sessionId) {
        void api.put(`/sessions/${sessionId}/status`, { status: 'completed' }).catch(() => {});
      }
    }
  };

  const handleReportSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!user?.user_id || !assignment || !reportText.trim()) return;

    try {
      setReportSubmitting(true);
      await submitStudentReport(sessionId, user.user_id, assignment.sectionId, reportText.trim(), assignmentId);
      if (eventCollector) {
        void eventCollector.emit('report_submitted');
      }
      setReportSuccess('Report shared successfully with your teacher / instructor.');
      setReportText('');
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(null);
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit report.');
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading lesson player…</div>;
  }

  if (error || !assignment || !user || !assignmentId) {
    return (
      <div style={{ padding: '2rem', color: '#c62828' }}>
        <h2>Error Loading Lesson</h2>
        <p>{error ?? 'Lesson data unavailable.'}</p>
        <button onClick={() => void navigate('/student')}>Back to Dashboard</button>
      </div>
    );
  }

  const isProctorActive = proctorStatus.code === 'active' || proctorStatus.code === 'monitoring_ready';

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Consent Modal if not yet accepted */}
      {needsConsent && !consentAccepted && (
        <ConsentNoticeModal studentUid={user.user_id} onAccepted={handleConsentAccepted} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          onClick={() => void navigate('/student')}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}
        >
          ← Back to Assignments
        </button>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: isProctorActive ? '#dcfce7' : '#fef3c7',
              color: isProctorActive ? '#166534' : '#b45309',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: isProctorActive ? '#22c55e' : '#f59e0b' }} />
            {isProctorActive ? 'AI Proctor Active (lite_mobilenet_v2)' : proctorStatus.message}
          </span>

          <button
            onClick={() => setShowReportModal(true)}
            style={{ padding: '0.5rem 1rem', background: '#f57c00', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            Report Interruption / Issue
          </button>
        </div>
      </div>

      {latestAlert && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          ⚠️ Observation Alert: {latestAlert} (Recorded for instructor review)
        </div>
      )}

      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{assignment.title}</h1>
        <p style={{ margin: '0.25rem 0 0 0', color: '#64748b' }}>
          Section ID: {assignment.sectionId} | Video Duration: {Math.floor(assignment.durationSec / 60)}m {assignment.durationSec % 60}s | Required Watch Time: <strong>{Math.ceil((assignment.durationSec * assignment.completionThreshold) / 60)} Minutes</strong>
        </p>
      </header>

      {/* Main Container: Video Player & AI Proctor HUD */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', alignItems: 'start' }}>
        {/* Left: Video Player */}
        <div>
          <CustomVideoPlayer
            assignmentId={assignmentId}
            studentUid={user.user_id}
            sectionId={assignment.sectionId}
            sourceUrl={assignment.sourceUrl}
            durationSec={assignment.durationSec}
            completionThreshold={assignment.completionThreshold}
            policy={assignment.policy}
            eventCollector={eventCollector ?? undefined}
            initialChunks={progress?.chunks ?? {}}
            onProgressUpdate={handleProgressUpdate}
          />

          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#475569' }}>
            ℹ️ <strong>Viewing Rules:</strong> Forward video seeking is turned off. You may watch at your own pace without arbitrary time cutoffs. Video is marked complete only upon meeting the required watch threshold.
          </div>
        </div>

        {/* Right: Browser AI Proctor HUD Canvas & Camera Feed */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📷 AI Proctor Camera HUD
            </h3>
            <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              350ms Inference
            </span>
          </div>

          {/* Webcam & Overlay Canvas Container */}
          <div style={{ position: 'relative', width: '100%', height: '220px', background: '#000', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.75rem' }}>
            <video
              id="proctor-webcam"
              ref={webcamRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <canvas
              id="proctor-hud-canvas"
              ref={hudCanvasRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            />
          </div>

          {/* Proctor Stats & Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
              <span>Evidence Captures:</span>
              <strong style={{ color: snapshotCount > 0 ? '#d97706' : '#16a34a' }}>{snapshotCount} Recorded</strong>
            </div>

            <div style={{ background: '#eff6ff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #bfdbfe', fontSize: '0.72rem', color: '#1e40af' }}>
              🔒 <strong>Privacy Protected:</strong> Your camera feed is processed entirely inside your local browser via WebGL. Raw video is never uploaded.
            </div>
          </div>
        </div>
      </div>

      {/* Student Technical Issue / Interruption Report Modal */}
      {showReportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <form onSubmit={(e) => void handleReportSubmit(e)} style={{ background: '#fff', padding: '2rem', borderRadius: '8px', maxWidth: '500px', width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Report Interruption or Issue</h3>
            <p style={{ fontSize: '0.9rem', color: '#555' }}>
              Explain any technical glitch, phone call, or interruption during this lesson. Your explanation will be attached to this session for your instructor to review.
            </p>

            {reportSuccess ? (
              <p style={{ color: '#2e7d32', fontWeight: 600 }}>{reportSuccess}</p>
            ) : (
              <>
                <textarea
                  rows={4}
                  placeholder="Describe what happened (e.g., received phone call, browser crashed, internet dropped)..."
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  required
                  maxLength={2000}
                  style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', borderRadius: '4px', border: '1px solid #ccc' }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" onClick={() => setShowReportModal(false)} style={{ padding: '0.5rem 1rem' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={reportSubmitting} style={{ padding: '0.5rem 1rem', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '4px' }}>
                    {reportSubmitting ? 'Submitting…' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
