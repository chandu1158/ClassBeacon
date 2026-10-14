import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import type { AssignmentPolicy } from '@cb/types/firestore';
import {
  computeWatchedChunks,
  getFurthestWatchedPosition,
  type Interval,
} from '@cb/lib/intervalMerge';
import { ProgressRetryQueue, type SaveStatus } from '@cb/lib/offlineQueue';
import { updateProgressBeat } from '@cb/services/progressService';
import type { EventCollector } from '@cb/lib/eventCollector';

interface CustomVideoPlayerProps {
  assignmentId: string;
  studentUid: string;
  sectionId: string;
  sourceUrl: string;
  durationSec: number;
  completionThreshold: number;
  policy: AssignmentPolicy;
  eventCollector?: EventCollector | undefined;
  initialChunks?: Record<string, true> | undefined;
  onProgressUpdate?: ((chunks: Record<string, true>, isCompleted: boolean) => void) | undefined;
  onDurationDetected?: ((detectedSec: number) => void) | undefined;
}

interface YTPlayerInstance {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  pauseVideo: () => void;
  playVideo: () => void;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void;
            onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  const id = match?.[2]?.replace(/\.mp4$/i, '') ?? null;
  return id && id.length === 11 ? id : null;
}

export default function CustomVideoPlayer({
  assignmentId,
  studentUid,
  sectionId,
  sourceUrl,
  durationSec,
  completionThreshold,
  policy,
  eventCollector,
  initialChunks = {},
  onProgressUpdate,
  onDurationDetected,
}: CustomVideoPlayerProps): ReactNode {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytId = getYouTubeVideoId(sourceUrl);

  // Interval collection state
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [chunks, setChunks] = useState<Record<string, true>>(initialChunks);
  const [actualDuration, setActualDuration] = useState<number>(durationSec || 300);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [liveWatchedSec, setLiveWatchedSec] = useState<number>(Object.keys(initialChunks).length * 5);
  const [skipWarningPopup, setSkipWarningPopup] = useState<string | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSkipWarning = (resetPosSec: number): void => {
    const msg = `⚠️ Forward video skipping is disabled! Playback reset to ${Math.round(resetPosSec)}s.`;
    setStatusMessage(msg);
    setSkipWarningPopup(msg);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => {
      setSkipWarningPopup(null);
    }, 4500);
  };

  // Tracking playback state
  const isPlayingRef = useRef(false);
  const isSeekingRef = useRef(false);
  const lastSampleTimeRef = useRef<number | null>(null);
  const lastWallClockRef = useRef<number | null>(null);
  const chunksRef = useRef<Record<string, true>>(initialChunks);
  // Continuous high-water mark so continuous playback between 5s chunk boundaries is NEVER mistaken for a skip
  const maxContinuousTimeRef = useRef<number>(getFurthestWatchedPosition(initialChunks, 5));

  // Queue ref
  const queueRef = useRef<ProgressRetryQueue | null>(null);
  const lastSavedCountRef = useRef<number>(Object.keys(initialChunks).length);

  const isSequential = policy ? policy.sequential !== false : true;

  // Keep chunksRef and maxContinuousTimeRef in sync when initialChunks or chunks update
  useEffect(() => {
    chunksRef.current = chunks;
    const chunkHighWater = getFurthestWatchedPosition(chunks, 5);
    if (chunkHighWater > maxContinuousTimeRef.current) {
      maxContinuousTimeRef.current = chunkHighWater;
    }
  }, [chunks]);

  // Sync with initialChunks when loaded asynchronously from API
  useEffect(() => {
    if (initialChunks && Object.keys(initialChunks).length > 0) {
      setChunks((prev) => ({ ...initialChunks, ...prev }));
      const chunkHighWater = getFurthestWatchedPosition(initialChunks, 5);
      if (chunkHighWater > maxContinuousTimeRef.current) {
        maxContinuousTimeRef.current = chunkHighWater;
      }
      setLiveWatchedSec((prev) => Math.max(prev, chunkHighWater));
    }
  }, [initialChunks]);

  // Initialize progress retry queue
  useEffect(() => {
    queueRef.current = new ProgressRetryQueue({
      maxRetries: 4,
      baseDelayMs: 1000,
      onStatusChange: (status, msg) => {
        setSaveStatus(status);
        setStatusMessage(msg ?? null);
      },
      saveFn: async (payload) => {
        await updateProgressBeat(
          payload.assignmentId,
          payload.studentUid,
          payload.chunks,
          payload.completedAtDate,
        );
      },
      logErrorEventFn: async (errDetails) => {
        if (eventCollector) {
          void eventCollector.emit('progress_error', { details: errDetails });
        }
      },
    });
  }, [eventCollector]);

  // Load YouTube IFrame API when ytId is present
  useEffect(() => {
    if (!ytId) return;

    let isCancelled = false;

    const initYTPlayer = (): void => {
      if (isCancelled || !ytContainerRef.current || !window.YT?.Player) return;

      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: ytId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          disablekb: isSequential ? 1 : 0,
          iv_load_policy: 3, // Hide video annotations
          fs: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (isCancelled) return;
            try {
              const dur = event.target.getDuration();
              if (dur && dur > 0) {
                const rounded = Math.round(dur);
                setActualDuration(rounded);
                if (onDurationDetected) onDurationDetected(rounded);
              }
              const resumePos = maxContinuousTimeRef.current;
              if (resumePos > 0) {
                event.target.seekTo(resumePos, true);
              }
            } catch {}
          },
          onStateChange: (event) => {
            if (isCancelled) return;
            // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
            if (event.data === 1) {
              isPlayingRef.current = true;
              const cur = event.target.getCurrentTime() || 0;
              const allowedMax = Math.max(
                maxContinuousTimeRef.current,
                getFurthestWatchedPosition(chunksRef.current, 5)
              );

              // Block forward skipping only when dragging scrubber >7.0s ahead of continuous progress
              // (Prevents false resets when opening YouTube settings/quality/subtitles menus)
              if (isSequential && cur > allowedMax + 7.0) {
                event.target.seekTo(allowedMax, true);
                lastSampleTimeRef.current = allowedMax;
                triggerSkipWarning(allowedMax);
              } else {
                if (cur > maxContinuousTimeRef.current) {
                  maxContinuousTimeRef.current = cur;
                }
                lastSampleTimeRef.current = cur;
              }
              lastWallClockRef.current = Date.now();
              if (eventCollector) void eventCollector.emit('play', { pos: Math.round(cur) });
            } else if (event.data === 2 || event.data === 0) {
              isPlayingRef.current = false;
              lastSampleTimeRef.current = null;
              lastWallClockRef.current = null;
              if (eventCollector) {
                const cur = event.target.getCurrentTime() || 0;
                void eventCollector.emit('pause', { pos: Math.round(cur) });
              }
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initYTPlayer();
    } else {
      const existingScript = document.getElementById('youtube-iframe-api');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevReady) prevReady();
        initYTPlayer();
      };
    }

    return () => {
      isCancelled = true;
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
    };
  }, [ytId, isSequential, eventCollector, onDurationDetected]);

  // Compute watched chunks whenever intervals change
  useEffect(() => {
    const totalChunks = Math.max(1, Math.ceil(actualDuration / 5));
    // Mark a 5s chunk as watched once 3.0s (60%) of it has been played continuously
    const newChunks = computeWatchedChunks(intervals, 5, totalChunks, 0.6);

    // Automatically incorporate continuous playback chunks up to high-water mark
    const continuousChunkCount = Math.floor(maxContinuousTimeRef.current / 5);
    const continuousChunks: Record<string, true> = {};
    for (let c = 0; c < continuousChunkCount && c < totalChunks; c++) {
      continuousChunks[c.toString()] = true;
    }

    const mergedChunks = { ...initialChunks, ...continuousChunks, ...newChunks };
    setChunks(mergedChunks);

    const watchedChunksCount = Object.keys(mergedChunks).length;
    const isCompleted = watchedChunksCount * 5 >= completionThreshold * actualDuration;

    if (onProgressUpdate) {
      onProgressUpdate(mergedChunks, isCompleted);
    }

    // Save immediately whenever a new 5-second chunk is earned
    if (watchedChunksCount > lastSavedCountRef.current && queueRef.current) {
      lastSavedCountRef.current = watchedChunksCount;
      queueRef.current.enqueue({
        assignmentId,
        studentUid,
        sectionId,
        chunks: mergedChunks,
        lastBeatAtDate: new Date(),
        completedAtDate: isCompleted ? new Date() : undefined,
      });
    }
  }, [intervals, actualDuration, completionThreshold, initialChunks, onProgressUpdate, assignmentId, studentUid, sectionId]);

  // Periodic heartbeat saver every 15s
  useEffect(() => {
    const timer = setInterval(() => {
      if (!queueRef.current || !isPlayingRef.current) return;

      const watchedCount = Object.keys(chunks).length;
      const isCompleted = watchedCount * 5 >= completionThreshold * actualDuration;

      queueRef.current.enqueue({
        assignmentId,
        studentUid,
        sectionId,
        chunks,
        lastBeatAtDate: new Date(),
        completedAtDate: isCompleted ? new Date() : undefined,
      });

      if (eventCollector) {
        void eventCollector.emit('heartbeat', { watchedChunks: watchedCount });
      }
    }, 15_000);

    return () => clearInterval(timer);
  }, [assignmentId, studentUid, sectionId, chunks, actualDuration, completionThreshold, eventCollector]);

  // Event Listeners for Tab Visibility, Focus/Blur, and Network Status
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        if (eventCollector) void eventCollector.emit('tab_hidden');
        if (policy.pauseOnHidden) {
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
            setStatusMessage('Video paused automatically because the lesson tab was hidden.');
          }
          if (ytPlayerRef.current && isPlayingRef.current) {
            try {
              ytPlayerRef.current.pauseVideo();
              setStatusMessage('Video paused automatically because the lesson tab was hidden.');
            } catch {}
          }
        }
      } else {
        if (eventCollector) void eventCollector.emit('tab_visible');
      }
    };

    const handleBlur = (): void => {
      if (eventCollector) void eventCollector.emit('window_blur');
    };

    const handleFocus = (): void => {
      if (eventCollector) void eventCollector.emit('window_focus');
    };

    const handleOffline = (): void => {
      if (eventCollector) void eventCollector.emit('offline');
    };

    const handleOnline = (): void => {
      if (eventCollector) void eventCollector.emit('online');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [eventCollector, policy.pauseOnHidden]);

  // Unified 1-second playback interval collector (supports both HTML5 <video> and YouTube Player API)
  useEffect(() => {
    const timer = setInterval(() => {
      let currentTime: number | null = null;

      if (ytId && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        try {
          const state = ytPlayerRef.current.getPlayerState();
          if (state === 1) {
            isPlayingRef.current = true;
          } else {
            return;
          }
          currentTime = ytPlayerRef.current.getCurrentTime();
          const dur = ytPlayerRef.current.getDuration();
          if (dur && dur > 0 && Math.abs(dur - actualDuration) > 2) {
            const rounded = Math.round(dur);
            setActualDuration(rounded);
            if (onDurationDetected) onDurationDetected(rounded);
          }
        } catch {
          return;
        }
      } else if (videoRef.current && !videoRef.current.paused) {
        isPlayingRef.current = true;
        currentTime = videoRef.current.currentTime;
      }

      if (currentTime === null || !isPlayingRef.current || isSeekingRef.current) return;

      const now = Date.now();
      const allowedHighWater = Math.max(
        maxContinuousTimeRef.current,
        getFurthestWatchedPosition(chunksRef.current, 5)
      );

      if (lastSampleTimeRef.current !== null && lastWallClockRef.current !== null) {
        const elapsedWallSec = Math.max(0.2, (now - lastWallClockRef.current) / 1000);
        const jumpSec = currentTime - lastSampleTimeRef.current;
        const maxAllowedStep = (policy.maxRate || 1.5) * elapsedWallSec + 3.0;

        // Did the user scrub forward past normal playback step AND their highest watched position (> allowedHighWater + 6.0s)?
        if (isSequential && jumpSec > maxAllowedStep && currentTime > allowedHighWater + 6.0) {
          if (ytId && ytPlayerRef.current) {
            try {
              ytPlayerRef.current.seekTo(allowedHighWater, true);
            } catch {}
          } else if (videoRef.current) {
            videoRef.current.currentTime = allowedHighWater;
          }
          lastSampleTimeRef.current = allowedHighWater;
          lastWallClockRef.current = now;
          triggerSkipWarning(allowedHighWater);
          if (eventCollector) void eventCollector.emit('seek_blocked', { pos: Math.round(allowedHighWater) });
          return;
        }

        // Valid continuous playback! Advance continuous high-water mark and record interval
        if (jumpSec > 0 && jumpSec <= maxAllowedStep) {
          const start = lastSampleTimeRef.current;
          const end = currentTime;
          if (end > maxContinuousTimeRef.current) {
            maxContinuousTimeRef.current = end;
          }
          setLiveWatchedSec(Math.round(Math.max(maxContinuousTimeRef.current, Object.keys(chunksRef.current).length * 5)));
          setIntervals((prev) => [...prev, [start, end]]);
        }
      } else {
        // First sample after play starts
        if (!isSequential || currentTime <= allowedHighWater + 5.0) {
          if (currentTime > maxContinuousTimeRef.current) {
            maxContinuousTimeRef.current = currentTime;
          }
        }
      }

      lastSampleTimeRef.current = currentTime;
      lastWallClockRef.current = now;
    }, 1000);

    return () => clearInterval(timer);
  }, [ytId, isSequential, policy.maxRate, actualDuration, eventCollector, onDurationDetected]);

  // HTML5 Media Event Handlers
  const handlePlay = (): void => {
    isPlayingRef.current = true;
    if (videoRef.current) {
      lastSampleTimeRef.current = videoRef.current.currentTime;
      lastWallClockRef.current = Date.now();
      if (eventCollector) void eventCollector.emit('play', { pos: Math.round(videoRef.current.currentTime) });
    }
  };

  const handlePause = (): void => {
    isPlayingRef.current = false;
    lastSampleTimeRef.current = null;
    lastWallClockRef.current = null;
    if (videoRef.current && eventCollector) {
      void eventCollector.emit('pause', { pos: Math.round(videoRef.current.currentTime) });
    }
  };

  const enforceNoForwardSkip = (video: HTMLVideoElement): boolean => {
    if (!isSequential) return false;
    const allowedMax = Math.max(
      maxContinuousTimeRef.current,
      getFurthestWatchedPosition(chunks, 5)
    );
    if (video.currentTime > allowedMax + 2.0) {
      video.currentTime = allowedMax;
      triggerSkipWarning(allowedMax);
      if (eventCollector) void eventCollector.emit('seek_blocked', { pos: Math.round(allowedMax) });
      return true;
    }
    return false;
  };

  const handleSeeking = (): void => {
    isSeekingRef.current = true;
    const video = videoRef.current;
    if (video) {
      enforceNoForwardSkip(video);
      if (eventCollector) {
        void eventCollector.emit('seek_attempt', { targetPos: Math.round(video.currentTime) });
      }
    }
  };

  const handleSeeked = (): void => {
    const video = videoRef.current;
    if (!video) return;

    enforceNoForwardSkip(video);

    isSeekingRef.current = false;
    lastSampleTimeRef.current = video.currentTime;
    lastWallClockRef.current = Date.now();
  };

  const handleTimeUpdate = (): void => {
    const video = videoRef.current;
    if (!video) return;
    if (!isSeekingRef.current && !video.paused) {
      if (video.currentTime <= maxContinuousTimeRef.current + 2.5 && video.currentTime > maxContinuousTimeRef.current) {
        maxContinuousTimeRef.current = video.currentTime;
      }
    }
  };

  const handleRateChange = (e: SyntheticEvent<HTMLVideoElement>): void => {
    const video = e.currentTarget;
    if (video.playbackRate > policy.maxRate) {
      video.playbackRate = policy.maxRate;
      setStatusMessage(`Playback rate capped at policy maximum (${policy.maxRate}x).`);
      if (eventCollector) void eventCollector.emit('rate_blocked', { attemptedRate: video.playbackRate });
    } else {
      if (eventCollector) void eventCollector.emit('rate_change', { rate: video.playbackRate });
    }
  };

  const watchedCount = Object.keys(chunks).length;
  const totalChunks = Math.max(1, Math.ceil(actualDuration / 5));
  const displayedWatchedSec = Math.min(actualDuration, Math.max(watchedCount * 5, liveWatchedSec));
  const watchedPercent = Math.min(100, Math.round((displayedWatchedSec / actualDuration) * 100));

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '800px' }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && videoRef.current && isSequential) {
          const allowedMax = Math.max(maxContinuousTimeRef.current, getFurthestWatchedPosition(chunks, 5));
          if (videoRef.current.currentTime + 5 > allowedMax + 1.0) {
            e.preventDefault();
            videoRef.current.currentTime = allowedMax;
            triggerSkipWarning(allowedMax);
          }
        }
      }}
    >
      <div style={{ position: 'relative', background: '#000', borderRadius: '8px', overflow: 'hidden', minHeight: ytId ? '420px' : 'auto' }}>
        {ytId ? (
          <div style={{ width: '100%', height: '420px' }}>
            <div ref={ytContainerRef} style={{ width: '100%', height: '100%' }} />
          </div>
        ) : (
          <video
            ref={videoRef}
            src={sourceUrl}
            controls
            controlsList="nodownload noplaybackrate"
            onLoadedMetadata={(e) => {
              const dur = e.currentTarget.duration;
              if (dur && isFinite(dur) && dur > 0) {
                const rounded = Math.round(dur);
                setActualDuration(rounded);
                if (onDurationDetected) onDurationDetected(rounded);
              }
            }}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeking={handleSeeking}
            onSeeked={handleSeeked}
            onTimeUpdate={handleTimeUpdate}
            onRateChange={handleRateChange}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        )}
        {/* Top-Right Mask Over YouTube Share / Copy Link Overlay */}
        <div
          style={{
            position: 'absolute',
            top: '0',
            right: '0',
            padding: '10px 14px',
            background: 'rgba(15,23,42,0.92)',
            color: '#38bdf8',
            borderBottomLeftRadius: '10px',
            fontSize: '0.78rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 20,
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
        >
          🔒 Video Skipping: OFF
        </div>
      </div>

      {/* Progress Bar & Status */}
      <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '6px', border: '1px solid #ddd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <strong>Watched Progress: {watchedPercent}% ({displayedWatchedSec}s / {actualDuration}s)</strong>
          <span style={{ fontSize: '0.85rem', color: saveStatus === 'delayed_retry' ? '#c62828' : '#2e7d32' }}>
            {saveStatus === 'saving' && 'Saving progress…'}
            {saveStatus === 'saved' && '✓ Progress saved'}
            {saveStatus === 'delayed_retry' && `⚠️ ${statusMessage ?? 'Saving delayed'}`}
            {saveStatus === 'failed' && `❌ ${statusMessage ?? 'Save failed'}`}
          </span>
        </div>

        {/* Chunks Visualization Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(totalChunks, 100)}, 1fr)`,
            height: '12px',
            background: '#e0e0e0',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
          title={`${watchedCount} of ${totalChunks} 5s chunks watched`}
        >
          {Array.from({ length: Math.min(totalChunks, 100) }).map((_, i) => {
            const mappedIdx = totalChunks > 100 ? Math.floor((i / 100) * totalChunks) : i;
            const isChunkDone = Boolean(chunks[mappedIdx.toString()]) || (mappedIdx * 5 + 3 <= displayedWatchedSec);
            return (
              <div
                key={i}
                style={{
                  background: isChunkDone ? '#1a73e8' : 'transparent',
                }}
              />
            );
          })}
        </div>

        {statusMessage && saveStatus !== 'delayed_retry' && (
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#555' }}>
            {statusMessage}
          </p>
        )}
      </div>

      {/* Bottom-Right Floating Skip Warning Popup */}
      {skipWarningPopup && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#dc2626',
            color: '#fff',
            padding: '1rem 1.25rem',
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(220, 38, 38, 0.4)',
            borderLeft: '6px solid #7f1d1d',
            zIndex: 9999,
            maxWidth: '380px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '1.3rem', lineHeight: 1 }}>🚫</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '2px' }}>
              Skipping Not Allowed
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.95 }}>
              {skipWarningPopup}
            </div>
          </div>
          <button
            onClick={() => setSkipWarningPopup(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1.1rem',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
