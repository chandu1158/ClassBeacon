import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@cb/lib/firebase';
import type { SessionDoc, EventDoc, ReportDoc, ReviewDoc, ProgressDoc, ReviewOutcome } from '@cb/types/firestore';
import { generateCsv } from '@cb/lib/csvExport';

export interface DerivedAlert {
  type: 'tab_hidden_long' | 'tab_hidden_frequent' | 'heartbeat_gap' | 'seek_attempts' | 'rate_change' | 'report_submitted' | 'progress_anomaly';
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface SessionWithDetails {
  id: string;
  data: SessionDoc;
  events: Array<{ id: string; data: EventDoc }>;
  reports: Array<{ id: string; data: ReportDoc }>;
  alerts: DerivedAlert[];
}

/**
 * Derived Alert Detector (Section 10.2 of Plan)
 * Evaluates session events strictly on recorded evidence without subjective attention scoring.
 */
export function deriveSessionAlerts(
  events: Array<{ id: string; data: EventDoc }>,
  reports: Array<{ id: string; data: ReportDoc }>,
  progress?: ProgressDoc,
): DerivedAlert[] {
  const alerts: DerivedAlert[] = [];

  let hiddenCount = 0;
  let seekAttemptCount = 0;
  let rateChangeCount = 0;

  for (const { data: evt } of events) {
    if (evt.type === 'tab_hidden') {
      hiddenCount++;
    } else if (evt.type === 'seek_attempt' || evt.type === 'seek_blocked') {
      seekAttemptCount++;
    } else if (evt.type === 'rate_change' || evt.type === 'rate_blocked') {
      rateChangeCount++;
    }
  }

  // Rule 1: High Hidden Count (>5 per session)
  if (hiddenCount >= 5) {
    alerts.push({
      type: 'tab_hidden_frequent',
      severity: 'warning',
      message: `Lesson tab hidden ${hiddenCount} times during session.`,
    });
  }

  // Rule 2: Forward Seek Attempts
  if (seekAttemptCount > 0) {
    alerts.push({
      type: 'seek_attempts',
      severity: 'info',
      message: `${seekAttemptCount} forward seek attempt(s) recorded.`,
    });
  }

  // Rule 3: Playback Rate Change Attempts
  if (rateChangeCount > 0) {
    alerts.push({
      type: 'rate_change',
      severity: 'info',
      message: `${rateChangeCount} rate change attempt(s) recorded.`,
    });
  }

  // Rule 4: Student Technical Report Submitted
  if (reports.length > 0) {
    alerts.push({
      type: 'report_submitted',
      severity: 'warning',
      message: `${reports.length} student report(s) submitted explaining interruption.`,
    });
  }

  // Rule 5: Progress Anomaly Check (out-of-range chunk keys)
  if (progress) {
    const outOfRangeKeys = Object.keys(progress.chunks).filter(
      (k) => Number(k) < 0 || Number(k) >= progress.totalChunks,
    );
    if (outOfRangeKeys.length > 0) {
      alerts.push({
        type: 'progress_anomaly',
        severity: 'critical',
        message: `Out-of-range chunk keys detected: [${outOfRangeKeys.join(', ')}].`,
      });
    }
  }

  return alerts;
}

export async function getSectionSessions(sectionId: string): Promise<SessionWithDetails[]> {
  // Query sessions for section
  const qSess = query(collection(db, 'sessions'), where('sectionId', '==', sectionId));
  const snapSess = await getDocs(qSess);

  const results: SessionWithDetails[] = [];

  for (const sessionDoc of snapSess.docs) {
    const sessionId = sessionDoc.id;
    const sessionData = sessionDoc.data() as SessionDoc;

    // Query events subcollection
    const qEvts = collection(db, 'sessions', sessionId, 'events');
    const snapEvts = await getDocs(qEvts);
    const events = snapEvts.docs.map((d) => ({ id: d.id, data: d.data() as EventDoc }));

    // Query student reports for session
    const qReps = query(collection(db, 'reports'), where('sessionId', '==', sessionId));
    const snapReps = await getDocs(qReps);
    const reports = snapReps.docs.map((d) => ({ id: d.id, data: d.data() as ReportDoc }));

    const alerts = deriveSessionAlerts(events, reports);

    results.push({
      id: sessionId,
      data: sessionData,
      events,
      reports,
      alerts,
    });
  }

  return results;
}

export async function createStaffReview(
  sessionId: string,
  sectionId: string,
  notes: string,
  outcome: ReviewOutcome,
  reviewedBy: string,
): Promise<string> {
  const reviewRef = doc(collection(db, 'reviews'));
  const data: ReviewDoc = {
    sessionId,
    sectionId,
    notes,
    outcome,
    reviewedBy,
    reviewedAt: serverTimestamp() as unknown as Timestamp,
  };
  await setDoc(reviewRef, data);
  return reviewRef.id;
}

export function buildSectionCsvExport(
  sectionName: string,
  sessions: SessionWithDetails[],
): string {
  interface ExportRow {
    section: string;
    sessionId: string;
    studentUid: string;
    assignmentId: string;
    status: string;
    startedAt: string;
    eventCount: number;
    alertCount: number;
    alertDetails: string;
    reportsCount: number;
  }

  const rows: ExportRow[] = sessions.map((s) => ({
    section: sectionName,
    sessionId: s.id,
    studentUid: s.data.studentUid,
    assignmentId: s.data.assignmentId,
    status: s.data.status,
    startedAt: s.data.startedAt ? new Date((s.data.startedAt as unknown as { seconds: number }).seconds * 1000).toISOString() : 'N/A',
    eventCount: s.data.eventCount,
    alertCount: s.alerts.length,
    alertDetails: s.alerts.map((a) => a.message).join(' | '),
    reportsCount: s.reports.length,
  }));

  return generateCsv(rows, [
    { header: 'Section Name', accessor: (r) => r.section },
    { header: 'Session ID', accessor: (r) => r.sessionId },
    { header: 'Student UID', accessor: (r) => r.studentUid },
    { header: 'Assignment ID', accessor: (r) => r.assignmentId },
    { header: 'Session Status', accessor: (r) => r.status },
    { header: 'Started At', accessor: (r) => r.startedAt },
    { header: 'Event Count', accessor: (r) => r.eventCount },
    { header: 'Alert Count', accessor: (r) => r.alertCount },
    { header: 'Alert Details', accessor: (r) => r.alertDetails },
    { header: 'Reports Count', accessor: (r) => r.reportsCount },
  ]);
}
