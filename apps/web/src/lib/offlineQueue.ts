export type SaveStatus = 'idle' | 'saving' | 'saved' | 'delayed_retry' | 'failed';

export interface ProgressPayload {
  assignmentId: string;
  studentUid: string;
  sectionId: string;
  chunks: Record<string, true>;
  lastBeatAtDate: Date;
  completedAtDate?: Date | undefined;
}

export interface QueueOptions {
  maxRetries?: number | undefined;
  baseDelayMs?: number | undefined;
  onStatusChange?: ((status: SaveStatus, errorMessage?: string) => void) | undefined;
  saveFn: (payload: ProgressPayload) => Promise<void>;
  logErrorEventFn?: ((errorDetails: string) => Promise<void>) | undefined;
}

export class ProgressRetryQueue {
  private status: SaveStatus = 'idle';
  private pendingPayload: ProgressPayload | null = null;
  private isProcessing = false;
  private retries = 0;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly onStatusChange?: ((status: SaveStatus, errorMessage?: string) => void) | undefined;
  private readonly saveFn: (payload: ProgressPayload) => Promise<void>;
  private readonly logErrorEventFn?: ((errorDetails: string) => Promise<void>) | undefined;

  constructor(options: QueueOptions) {
    this.maxRetries = options.maxRetries ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.onStatusChange = options.onStatusChange;
    this.saveFn = options.saveFn;
    this.logErrorEventFn = options.logErrorEventFn;
  }

  public getStatus(): SaveStatus {
    return this.status;
  }

  public enqueue(payload: ProgressPayload): void {
    // Always store the latest payload (newer state supersedes older state)
    this.pendingPayload = payload;
    void this.processQueue();
  }

  private updateStatus(status: SaveStatus, msg?: string): void {
    this.status = status;
    if (this.onStatusChange) {
      this.onStatusChange(status, msg);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || !this.pendingPayload) return;

    this.isProcessing = true;
    const currentPayload = this.pendingPayload;
    this.pendingPayload = null;

    this.updateStatus('saving');

    try {
      await this.saveFn(currentPayload);
      this.retries = 0;
      this.updateStatus('saved');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.retries++;

      // Log error event for auditing (D5 requirement)
      if (this.logErrorEventFn) {
        void this.logErrorEventFn(`Progress write failed (attempt ${this.retries}): ${errMsg}`);
      }

      if (this.retries <= this.maxRetries) {
        // Re-enqueue payload for retry with exponential backoff
        this.pendingPayload = currentPayload;
        this.updateStatus('delayed_retry', `Saving delayed (${this.retries}/${this.maxRetries}). Retrying…`);

        const delay = this.baseDelayMs * Math.pow(2, this.retries - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        this.isProcessing = false;
        void this.processQueue();
        return;
      } else {
        this.updateStatus('failed', `Failed to save progress after ${this.maxRetries} attempts.`);
      }
    } finally {
      this.isProcessing = false;
      // If a new payload arrived while saving, process it
      if (this.pendingPayload) {
        void this.processQueue();
      }
    }
  }
}
