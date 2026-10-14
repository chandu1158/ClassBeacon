/**
 * TypeScript wrapper for ProctorAI
 */

export interface ProctorStatus {
  code: string;
  message: string;
}

export interface ProctorEvent {
  type: string;
  timestamp: string;
  details: {
    label?: string;
    confidence?: number;
    detected_object?: string;
    count?: number;
    durationSec?: number;
    note?: string;
    consecutiveFrames?: number;
    bbox?: [number, number, number, number];
  };
}

export interface ProctorOptions {
  videoElement: HTMLVideoElement | null;
  hudCanvas: HTMLCanvasElement | null;
  studentId: string;
  sessionId: number | string;
  assignmentId: number | string;
  sectionId: number | string;
  token?: string | null;
  onStatusChange?: (status: ProctorStatus) => void;
  onEvent?: (event: ProctorEvent) => void;
  getProgress?: () => { percent: number; currentTime: number };
  config?: {
    modelBase?: string;
    inferenceIntervalMs?: number;
    confidenceThreshold?: number;
    consecutiveFramesRequired?: number;
    absenceThresholdMs?: number;
    snapshotCooldownMs?: number;
    prohibitedObjects?: string[];
    apiEndpoint?: string;
  };
}

declare global {
  interface Window {
    ProctorAI?: new (options: ProctorOptions) => ProctorAIInstance;
    tf?: unknown;
    cocoSsd?: {
      load: (options?: { base?: string }) => Promise<{
        detect: (element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) => Promise<
          Array<{
            class: string;
            score: number;
            bbox: [number, number, number, number];
          }>
        >;
      }>;
    };
  }
}

export interface ProctorAIInstance {
  init: () => Promise<boolean>;
  start: () => void;
  stop: () => void;
  startCamera: () => Promise<void>;
  setConfidenceThreshold: (threshold: number) => void;
  stats: {
    framesProcessed: number;
    violationsDetected: number;
    snapshotsCaptured: number;
  };
}

export function getProctorAI(options: ProctorOptions): ProctorAIInstance | null {
  if (typeof window !== 'undefined' && window.ProctorAI) {
    return new window.ProctorAI(options);
  }
  return null;
}
