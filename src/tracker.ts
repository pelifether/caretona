import type { Shape } from './blendshapes';
import { lerpShape } from './blendshapes';

export interface TrackResult {
  faceDetected: boolean;
  shape: Shape;
  /** Normalized [0..1] landmark positions (x, y) in video space, if available. */
  landmarks: Array<[number, number]> | null;
}

export interface Tracker {
  /** Requests camera, attaches stream to the video element, starts detection. */
  start(video: HTMLVideoElement): Promise<void>;
  latest(): TrackResult;
  /** The local camera (or mock) stream, for sharing over WebRTC. */
  getStream(): MediaStream | null;
  stop(): void;
  /** Mock-only hint: expression the fake player drifts toward. Ignored by the real tracker. */
  setMockTarget(shape: Shape): void;
}

const EMPTY: TrackResult = { faceDetected: false, shape: {}, landmarks: null };

// ---------------------------------------------------------------- real tracker

class MediaPipeTracker implements Tracker {
  private stream: MediaStream | null = null;
  private landmarker: import('@mediapipe/tasks-vision').FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private result: TrackResult = EMPTY;
  private raf = 0;
  private lastVideoTime = -1;

  async start(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    // Ask for the camera first so the permission prompt appears immediately;
    // the model loads in parallel.
    const streamPromise = navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } },
      audio: false,
    });

    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
    );
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    });

    this.stream = await streamPromise;
    video.srcObject = this.stream;
    await video.play();

    const detect = () => {
      if (!this.landmarker || !this.video) return;
      if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        const res = this.landmarker.detectForVideo(this.video, performance.now());
        if (res.faceLandmarks.length > 0) {
          const shape: Shape = {};
          for (const b of res.faceBlendshapes[0]?.categories ?? []) {
            shape[b.categoryName] = b.score;
          }
          this.result = {
            faceDetected: true,
            shape,
            landmarks: res.faceLandmarks[0].map((p) => [p.x, p.y]),
          };
        } else {
          this.result = EMPTY;
        }
      }
      this.raf = requestAnimationFrame(detect);
    };
    this.raf = requestAnimationFrame(detect);
  }

  latest(): TrackResult {
    return this.result;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.result = EMPTY;
  }

  setMockTarget(): void {
    /* no-op */
  }
}

// ---------------------------------------------------------------- mock tracker

class MockTracker implements Tracker {
  private raf = 0;
  private target: Shape = {};
  private current: Shape = {};
  private canvas = document.createElement('canvas');
  private startTime = 0;
  private stream: MediaStream | null = null;

  async start(video: HTMLVideoElement): Promise<void> {
    this.canvas.width = 480;
    this.canvas.height = 640;
    const ctx = this.canvas.getContext('2d')!;
    this.startTime = performance.now();

    const draw = () => {
      // Fake "player" drifts toward the mock target with imperfection + noise.
      this.current = lerpShape(this.current, this.target, 0.06);
      const t = (performance.now() - this.startTime) / 1000;
      ctx.fillStyle = '#2a3138';
      ctx.fillRect(0, 0, 480, 640);
      ctx.fillStyle = '#8d6e5a';
      ctx.beginPath();
      ctx.ellipse(240 + Math.sin(t * 0.9) * 12, 300 + Math.cos(t * 1.3) * 8, 130, 165, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3f45';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#cfd8dc';
      ctx.fillText('MOCK CAMERA', 240, 600);
      this.raf = requestAnimationFrame(draw);
    };
    draw();

    this.stream = this.canvas.captureStream(30);
    video.srcObject = this.stream;
    await video.play();
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  latest(): TrackResult {
    // ~92% of the way to the target plus per-channel jitter → realistic good-but-not-perfect play.
    const shape: Shape = {};
    for (const [k, v] of Object.entries(this.current)) {
      shape[k] = Math.max(0, Math.min(1, v + (Math.random() - 0.5) * 0.06));
    }
    const t = performance.now() / 1000;
    const landmarks: Array<[number, number]> = [];
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r = 0.18 + 0.13 * Math.abs(Math.sin(i * 2.7));
      landmarks.push([0.5 + Math.cos(a) * r + Math.sin(t + i) * 0.004, 0.47 + Math.sin(a) * r * 1.25]);
    }
    return { faceDetected: true, shape, landmarks };
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  setMockTarget(shape: Shape): void {
    this.target = shape;
  }
}

export function createTracker(): Tracker {
  const mock = new URLSearchParams(location.search).has('mock');
  return mock ? new MockTracker() : new MediaPipeTracker();
}
