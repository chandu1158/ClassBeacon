/**
 * EVENT_TYPES is the single source of truth for all event type strings.
 * It drives:
 *   1. The client event collector (what events are emitted)
 *   2. The Firestore security rules (what types are allowed in the 'in' list)
 *   3. The contract test (every value here is written against the rules)
 *
 * To add a new event type:
 *   1. Add it here
 *   2. Add it to the 'in' list in firestore.rules
 *   3. The contract test will automatically cover it
 */
export const EVENT_TYPES = [
  'session_start',
  'session_end',
  'play',
  'pause',
  'seek_attempt',
  'seek_blocked',
  'rate_change',
  'rate_blocked',
  'tab_hidden',
  'tab_visible',
  'window_blur',
  'window_focus',
  'offline',
  'online',
  'heartbeat',
  'progress_saved',
  'progress_error',
  'report_submitted',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const NOTICE_VERSION = '1.0.0';
export const CHUNK_SEC = 5;
export const CHUNK_COVERAGE_THRESHOLD = 0.8; // 80% of a chunk must be played
export const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
export const MAX_EVENTS_PER_SESSION = 500;
export const MIN_EVENT_SPACING_MS = 1_000; // 1 second
export const RETENTION_DAYS = 180;
