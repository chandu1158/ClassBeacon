import { EVENT_TYPES, type EventType, MAX_EVENTS_PER_SESSION, MIN_EVENT_SPACING_MS } from '@cb/lib/constants';
import { logSessionEvent } from '@cb/services/sessionService';

export class EventCollector {
  private readonly sessionId: string;
  private seq = 0;
  private lastEmitTime = 0;
  private eventCount = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public async emit(eventType: EventType, details: Record<string, unknown> = {}): Promise<boolean> {
    // 1. Validate allowlisted type
    if (!EVENT_TYPES.includes(eventType)) {
      console.warn(`[EventCollector] Rejected non-allowlisted event type: ${eventType}`);
      return false;
    }

    // 2. Check session event cap
    if (this.eventCount >= MAX_EVENTS_PER_SESSION) {
      console.warn(`[EventCollector] Event cap (${MAX_EVENTS_PER_SESSION}) reached for session ${this.sessionId}`);
      return false;
    }

    // 3. Minimum event spacing check (throttling)
    const now = Date.now();
    if (now - this.lastEmitTime < MIN_EVENT_SPACING_MS && eventType !== 'session_end') {
      console.warn(`[EventCollector] Throttled event ${eventType} (less than ${MIN_EVENT_SPACING_MS}ms since last event)`);
      return false;
    }

    this.seq++;
    this.eventCount++;
    this.lastEmitTime = now;

    try {
      await logSessionEvent(this.sessionId, eventType, this.seq, details);
      return true;
    } catch (err) {
      console.error(`[EventCollector] Failed to log event ${eventType}:`, err);
      return false;
    }
  }

  public getEventCount(): number {
    return this.eventCount;
  }
}
