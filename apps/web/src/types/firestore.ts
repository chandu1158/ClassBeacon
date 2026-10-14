import type { Timestamp } from 'firebase/firestore';
import type { EventType } from '@cb/lib/constants';

export interface UserDoc {
  displayName: string;
  active: boolean;
  createdAt: Timestamp;
}

export interface SectionDoc {
  name: string;
  ownerUid: string;
  staffUids: string[];
  createdAt: Timestamp;
}

export interface EnrollmentDoc {
  sectionId: string;
  studentUid: string;
  createdAt: Timestamp;
}

export interface VideoDoc {
  title: string;
  sourceUrl: string;
  durationSec: number;
  ownerUid: string;
  createdAt: Timestamp;
}

export interface AssignmentPolicy {
  sequential: boolean;
  pauseOnHidden: boolean;
  hiddenAlertSec: number;
  maxRate: number;
}

export interface AssignmentDoc {
  sectionId: string;
  videoId: string;
  title: string;
  sourceUrl: string;
  durationSec: number;
  completionThreshold: number; // 0–1
  policy: AssignmentPolicy;
  dueAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp;
}

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface SessionDoc {
  studentUid: string;
  assignmentId: string;
  sectionId: string;
  status: SessionStatus;
  startedAt: Timestamp;
  lastEventAt: Timestamp;
  eventCount: number;
  expireAt: Timestamp;
}

export interface EventDoc {
  type: EventType;
  seq: number;
  clientAt: number; // epoch ms — informational only
  serverAt: Timestamp; // trusted
  details: Record<string, unknown>;
  expireAt: Timestamp;
}

export interface ProgressDoc {
  studentUid: string;
  assignmentId: string;
  sectionId: string;
  durationSec: number;
  chunkSec: number;
  totalChunks: number;
  maxRate: number;
  threshold: number;
  chunks: Record<string, true>; // key = chunk index as string
  lastBeatAt: Timestamp;
  completedAt?: Timestamp;
}

export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

export interface ReportDoc {
  sessionId: string;
  studentUid: string;
  sectionId: string;
  text: string;
  status: ReportStatus;
  createdAt: Timestamp;
}

export type ReviewOutcome = 'resolved' | 'needs_follow_up' | 'technical_issue';

export interface ReviewDoc {
  sessionId: string;
  sectionId: string;
  notes: string;
  outcome: ReviewOutcome;
  reviewedBy: string;
  reviewedAt: Timestamp;
}

export interface ConsentDoc {
  studentUid: string;
  noticeVersion: string;
  acceptedAt: Timestamp;
}
