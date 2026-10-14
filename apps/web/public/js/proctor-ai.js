/**
 * ClassBeacon Browser-Based AI Student Monitoring Engine
 * Location: js/proctor-ai.js
 *
 * Provides real-time client-side object detection, multiple-person detection,
 * candidate-absence tracking, HUD overlay rendering, and watermarked evidence capture.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProctorAI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_CONFIG = {
    // Model configuration
    modelBase: 'lite_mobilenet_v2', // lite_mobilenet_v2 per requirement
    inferenceIntervalMs: 350,       // Analyze frame approx every 350ms
    confidenceThreshold: 0.50,      // Minimum confidence score
    consecutiveFramesRequired: 2,   // Require 2 consecutive frames for prohibited objects
    absenceThresholdMs: 3000,       // Candidate absence flagged after 3s with no person
    snapshotCooldownMs: 15000,      // 15 seconds cooldown between snapshots of same event
    prohibitedObjects: ['cell phone', 'laptop', 'tv', 'remote', 'book'],
    apiEndpoint: 'http://localhost:5000/api/proctor_log',
  };

  class ProctorAI {
    /**
     * @param {Object} options
     * @param {HTMLVideoElement} options.videoElement - Student webcam video element
     * @param {HTMLCanvasElement} options.hudCanvas - canvas#proctor-hud-canvas
     * @param {string} options.studentId - Authenticated student identifier (Roll / UID)
     * @param {number|string} options.sessionId - Active session ID
     * @param {number|string} options.assignmentId - Assignment / Video ID
     * @param {number|string} options.sectionId - Assigned Section ID
     * @param {string} [options.token] - JWT Auth token for API requests
     * @param {Function} [options.onStatusChange] - Callback for status updates
     * @param {Function} [options.onEvent] - Callback for detected monitoring events
     * @param {Function} [options.getProgress] - Callback returning current video progress { percent, currentTime }
     * @param {Object} [options.config] - Custom override settings
     */
    constructor(options = {}) {
      this.videoElement = options.videoElement || null;
      this.hudCanvas = options.hudCanvas || null;
      this.studentId = options.studentId || 'STUDENT';
      this.sessionId = options.sessionId || 0;
      this.assignmentId = options.assignmentId || 0;
      this.sectionId = options.sectionId || 0;
      this.token = options.token || (typeof localStorage !== 'undefined' ? localStorage.getItem('cb_token') : null);

      this.onStatusChange = options.onStatusChange || (() => {});
      this.onEvent = options.onEvent || (() => {});
      this.getProgress = options.getProgress || (() => ({ percent: 0, currentTime: 0 }));

      this.config = Object.assign({}, DEFAULT_CONFIG, options.config || {});

      // Internal State
      this.model = null;
      this.stream = null;
      this.timerId = null;
      this.isInferring = false;
      this.isRunning = false;
      this.modelLoaded = false;

      // Detection & Event Tracking State
      this.lastPersonDetectedAt = Date.now();
      this.absenceFlagged = false;
      this.consecutiveDetections = new Map(); // objClass -> count
      this.lastSnapshotTimes = new Map();    // eventType -> timestamp
      this.latestPredictions = [];

      this.stats = {
        framesProcessed: 0,
        violationsDetected: 0,
        snapshotsCaptured: 0,
      };
    }

    /**
     * Set / update detection confidence threshold
     * @param {number} threshold - Value between 0.1 and 0.99
     */
    setConfidenceThreshold(threshold) {
      if (typeof threshold === 'number' && threshold >= 0.1 && threshold <= 0.99) {
        this.config.confidenceThreshold = threshold;
        this._updateStatus('info', `Confidence threshold set to ${(threshold * 100).toFixed(0)}%`);
      }
    }

    /**
     * Initialize webcam and load COCO-SSD model with lite_mobilenet_v2
     */
    async init() {
      try {
        this._updateStatus('loading', 'Checking browser compatibility and loading AI models…');

        // Verify Browser Support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Webcam access is not supported by your browser.');
        }

        // Wait for TensorFlow.js and COCO-SSD to load if needed
        await this._ensureLibrariesLoaded();

        // Load COCO-SSD with lite_mobilenet_v2
        this._updateStatus('loading', 'Loading COCO-SSD (lite_mobilenet_v2) inference engine…');
        this.model = await window.cocoSsd.load({
          base: this.config.modelBase,
        });
        this.modelLoaded = true;
        this._updateStatus('ready', 'AI model loaded successfully.');

        // Initialize Webcam Stream
        await this.startCamera();

        return true;
      } catch (err) {
        console.error('[ProctorAI] Initialization failed:', err);
        this._updateStatus('error', err.message || 'Failed to initialize AI monitoring.');
        throw err;
      }
    }

    /**
     * Start webcam feed
     */
    async startCamera() {
      try {
        this._updateStatus('camera_request', 'Requesting webcam access…');
        const constraints = {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        };

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (this.videoElement) {
          this.videoElement.srcObject = this.stream;
          await new Promise((resolve) => {
            this.videoElement.onloadedmetadata = () => {
              void this.videoElement.play();
              resolve();
            };
          });
        }

        this._updateStatus('monitoring_ready', 'Camera active. Ready for monitoring.');
      } catch (err) {
        console.error('[ProctorAI] Camera permission denied or failed:', err);
        const userMsg = err.name === 'NotAllowedError'
          ? 'Camera permission denied. Monitoring cannot run without camera consent.'
          : 'Unable to access webcam: ' + err.message;
        this._updateStatus('camera_denied', userMsg);
        throw new Error(userMsg);
      }
    }

    /**
     * Start the real-time inference loop
     */
    start() {
      if (!this.modelLoaded) {
        console.warn('[ProctorAI] Cannot start: Model not loaded yet.');
        return;
      }

      if (this.isRunning) return;

      this.isRunning = true;
      this.lastPersonDetectedAt = Date.now();
      this.absenceFlagged = false;
      this.consecutiveDetections.clear();

      this._updateStatus('active', 'AI Monitoring Active (350ms interval, lite_mobilenet_v2)');

      this.timerId = window.setInterval(() => {
        void this._processFrame();
      }, this.config.inferenceIntervalMs);
    }

    /**
     * Stop monitoring and release camera
     */
    stop() {
      this.isRunning = false;

      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }

      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }

      if (this.videoElement) {
        this.videoElement.srcObject = null;
      }

      this._clearHud();
      this._updateStatus('stopped', 'AI Monitoring stopped.');
    }

    /**
     * Core inference frame processor (approx every 350ms)
     * Mutex guard prevents overlapping inference calls.
     */
    async _processFrame() {
      if (this.isInferring || !this.isRunning) return;
      if (!this.videoElement || this.videoElement.readyState < 2) return;

      this.isInferring = true;
      try {
        const predictions = await this.model.detect(this.videoElement);
        this.stats.framesProcessed++;

        // Filter predictions by configured confidence threshold
        const validPredictions = predictions.filter(
          (p) => p.score >= this.config.confidenceThreshold
        );

        this.latestPredictions = validPredictions;

        // Categorize detections
        const persons = validPredictions.filter((p) => p.class === 'person');
        const prohibited = validPredictions.filter((p) =>
          this.config.prohibitedObjects.includes(p.class)
        );

        // 1. Candidate Absence Tracking (> 3 seconds no person)
        const now = Date.now();
        if (persons.length === 0) {
          const absenceDuration = now - this.lastPersonDetectedAt;
          if (absenceDuration >= this.config.absenceThresholdMs) {
            if (!this.absenceFlagged) {
              this.absenceFlagged = true;
              const durationSec = Math.round(absenceDuration / 1000);
              void this._handleEvent('face_absent', {
                label: `Candidate absent for ${durationSec}s`,
                confidence: 0.95,
                durationSec,
                note: 'No person detected in frame for >3 seconds',
              });
            }
          }
        } else {
          this.lastPersonDetectedAt = now;
          this.absenceFlagged = false;
        }

        // 2. Multiple People Detection (> 1 person)
        if (persons.length > 1) {
          const highestScore = Math.max(...persons.map((p) => p.score));
          void this._handleEvent('multiple_faces', {
            label: '⚠️ Multiple persons detected',
            confidence: highestScore,
            count: persons.length,
            note: 'Observable presence of more than one person in frame',
          });
        }

        // 3. Prohibited Object Detection with 2-Consecutive-Frame Confirmation
        const currentFrameClasses = new Set(prohibited.map((p) => p.class));

        // Update consecutive count for classes present in this frame
        for (const cls of currentFrameClasses) {
          const prevCount = this.consecutiveDetections.get(cls) || 0;
          const nextCount = prevCount + 1;
          this.consecutiveDetections.set(cls, nextCount);

          if (nextCount >= this.config.consecutiveFramesRequired) {
            const pred = prohibited.find((p) => p.class === cls);
            const isSecondDevice = cls === 'cell phone' || cls === 'laptop' || cls === 'tv' || cls === 'remote';
            const eventType = isSecondDevice ? 'second_device' : 'prohibited_object';

            void this._handleEvent(eventType, {
              label: isSecondDevice ? '⚠️ Other devices are detected' : `⚠️ Prohibited object detected (${cls})`,
              detected_object: cls,
              confidence: pred.score,
              consecutiveFrames: nextCount,
              bbox: pred.bbox,
              note: `Observable ${cls} confirmed across ${nextCount} consecutive frames`,
            });
          }
        }

        // Reset consecutive count for classes that were absent in this frame
        for (const [cls] of this.consecutiveDetections.entries()) {
          if (!currentFrameClasses.has(cls)) {
            this.consecutiveDetections.delete(cls);
          }
        }

        // 4. Render HUD overlay on canvas#proctor-hud-canvas
        this._renderHud(persons, prohibited);
      } catch (err) {
        console.error('[ProctorAI] Frame inference error:', err);
      } finally {
        this.isInferring = false;
      }
    }

    /**
     * Draw real-time bounding boxes and status overlay on canvas#proctor-hud-canvas
     * - Primary candidate: Green box (#22c55e)
     * - Multiple persons / Prohibited objects: Red boxes (#ef4444)
     */
    _renderHud(persons, prohibited) {
      if (!this.hudCanvas || !this.videoElement) return;

      const canvas = this.hudCanvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = this.videoElement.videoWidth || 640;
      const height = this.videoElement.videoHeight || 480;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      // Draw HUD header bar
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(0, 0, width, 28);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(
        `AI PROCTOR HUD | 350ms | Conf ≥ ${(this.config.confidenceThreshold * 100).toFixed(0)}% | Lite MobileNet V2`,
        10,
        18
      );

      // Status indicator on top right
      const isClean = prohibited.length === 0 && persons.length === 1;
      ctx.fillStyle = isClean ? '#4ade80' : '#f87171';
      ctx.fillText(isClean ? '● Normal View' : '⚠️ Flagged Event', width - 110, 18);

      // 1. Draw Primary Candidate (Green Box)
      if (persons.length > 0) {
        const primary = persons[0];
        this._drawBoundingBox(ctx, primary.bbox, '#22c55e', `Candidate (${(primary.score * 100).toFixed(0)}%)`);

        // Additional Persons (Red Box)
        for (let i = 1; i < persons.length; i++) {
          const extra = persons[i];
          this._drawBoundingBox(ctx, extra.bbox, '#ef4444', `Multiple Persons Detected (${(extra.score * 100).toFixed(0)}%)`);
        }
      }

      // 2. Draw Prohibited Objects (Red Boxes)
      for (const obj of prohibited) {
        const isDevice = obj.class === 'cell phone' || obj.class === 'laptop' || obj.class === 'tv' || obj.class === 'remote';
        this._drawBoundingBox(
          ctx,
          obj.bbox,
          '#ef4444',
          isDevice ? `Other Devices Detected (${(obj.score * 100).toFixed(0)}%)` : `Prohibited: ${obj.class} (${(obj.score * 100).toFixed(0)}%)`
        );
      }
    }

    /**
     * Helper to draw a single bounding box with label tag
     */
    _drawBoundingBox(ctx, bbox, color, label) {
      if (!bbox || bbox.length < 4) return;
      const [x, y, w, h] = bbox;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Label badge
      ctx.font = 'bold 12px system-ui, sans-serif';
      const textWidth = ctx.measureText(label).width;
      const tagHeight = 18;
      const tagY = Math.max(28, y - tagHeight);

      ctx.fillStyle = color;
      ctx.fillRect(x, tagY, textWidth + 10, tagHeight);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 5, tagY + 13);
      ctx.restore();
    }

    /**
     * Clear the HUD canvas
     */
    _clearHud() {
      if (this.hudCanvas) {
        const ctx = this.hudCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
      }
    }

    /**
     * Handle detected monitoring event:
     * - Check cooldown to prevent duplicate captures
     * - Capture watermarked snapshot
     * - Upload to api/proctor_log.php
     * - Trigger UI callbacks
     */
    async _handleEvent(eventType, details) {
      const now = Date.now();
      const lastTime = this.lastSnapshotTimes.get(eventType) || 0;

      // Deduplication Cooldown (15 seconds per event type)
      if (now - lastTime < this.config.snapshotCooldownMs) {
        return;
      }

      this.lastSnapshotTimes.set(eventType, now);
      this.stats.violationsDetected++;

      this.onEvent({
        type: eventType,
        timestamp: new Date().toISOString(),
        details,
      });

      // Capture single evidence snapshot with visible watermark
      try {
        const snapshotData = this._captureWatermarkedSnapshot(eventType, details);
        this.stats.snapshotsCaptured++;

        // Send to backend endpoint api/proctor_log.php
        await this._uploadEvidence(eventType, details, snapshotData);
      } catch (err) {
        console.error('[ProctorAI] Evidence capture/upload error:', err);
      }
    }

    /**
     * Capture evidence snapshot from webcam frame and apply visible watermark:
     * - Event timestamp
     * - Authenticated student identifier
     * - Event type & confidence score
     * - HUD bounding boxes
     */
    _captureWatermarkedSnapshot(eventType, details) {
      if (!this.videoElement) {
        throw new Error('Video element unavailable for snapshot capture.');
      }

      const width = this.videoElement.videoWidth || 640;
      const height = this.videoElement.videoHeight || 480;

      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = width;
      snapCanvas.height = height;
      const ctx = snapCanvas.getContext('2d');

      // 1. Draw webcam video frame
      ctx.drawImage(this.videoElement, 0, 0, width, height);

      // 2. Draw HUD bounding boxes onto evidence snapshot
      if (this.hudCanvas) {
        ctx.drawImage(this.hudCanvas, 0, 0, width, height);
      }

      // 3. Draw Watermark Banner at Bottom
      const bannerHeight = 36;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

      // Watermark Text: Timestamp, Student ID, Event Type, Confidence
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const confStr = details.confidence ? `${(details.confidence * 100).toFixed(0)}%` : 'N/A';
      const watermarkText = `[EVIDENCE] ${timeStr} | Student: ${this.studentId} | Event: ${eventType.toUpperCase()} | Conf: ${confStr}`;

      ctx.fillText(watermarkText, 12, height - bannerHeight + 16);

      // Sub-label explaining that this is an observation for faculty review
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 10px system-ui, sans-serif';
      ctx.fillText('Potential observable event for faculty review (not automated proof of misconduct)', 12, height - 6);

      return snapCanvas.toDataURL('image/jpeg', 0.85);
    }

    /**
     * Send snapshot and corresponding metadata to api/proctor_log.php
     * Includes automatic single-retry for safety.
     */
    async _uploadEvidence(eventType, details, snapshotData, retryCount = 1) {
      const progress = this.getProgress();

      const payload = {
        student_id: this.studentId,
        session_id: Number(this.sessionId) || 0,
        assignment_id: Number(this.assignmentId) || 0,
        section_id: Number(this.sectionId) || 0,
        event_type: eventType,
        confidence: details.confidence || 0.0,
        object_detected: details.detected_object || (eventType === 'face_absent' ? 'none' : 'person'),
        person_count: details.count || (eventType === 'face_absent' ? 0 : 1),
        snapshot_data: snapshotData,
        details: details,
        video_progress_percent: progress.percent || 0,
        playback_position: progress.currentTime || 0,
        timestamp: new Date().toISOString(),
      };

      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      try {
        const response = await fetch(this.config.apiEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        return await response.json();
      } catch (err) {
        console.warn(`[ProctorAI] Upload failed (${err.message}). Retries left: ${retryCount}`);
        if (retryCount > 0) {
          await new Promise((res) => setTimeout(res, 2000));
          return this._uploadEvidence(eventType, details, snapshotData, retryCount - 1);
        }
        throw err;
      }
    }

    _updateStatus(code, message) {
      this.onStatusChange({ code, message });
    }

    /**
     * Ensure TensorFlow.js and COCO-SSD scripts are loaded
     */
    async _ensureLibrariesLoaded() {
      if (window.tf && window.cocoSsd) return;

      const loadScript = (src) => {
        return new Promise((resolve, reject) => {
          const existing = document.querySelector(`script[src="${src}"]`);
          if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)));
            if (window.tf && src.includes('tf.min.js')) return resolve();
            if (window.cocoSsd && src.includes('coco-ssd')) return resolve();
            return resolve();
          }
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(s);
        });
      };

      if (!window.tf) {
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js');
      }
      if (!window.cocoSsd) {
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
      }
    }
  }

  return ProctorAI;
});
