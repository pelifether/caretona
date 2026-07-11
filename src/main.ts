import './style.css';
import { ReferenceFace, faceMeshPoints } from './referenceFace';
import { randomCareta, type Careta } from './caretas';
import { createTracker } from './tracker';
import { computeScore, averageShapes } from './scoring';
import type { Shape } from './blendshapes';

// ------------------------------------------------------------------ elements

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const refCanvas = $<HTMLCanvasElement>('ref-canvas');
const refMesh = $<HTMLCanvasElement>('ref-mesh');
const camMesh = $<HTMLCanvasElement>('cam-mesh');
const freezeCanvas = $<HTMLCanvasElement>('freeze-canvas');
const video = $<HTMLVideoElement>('cam');
const menu = $('menu');
const playBtn = $('play-btn');
const modeButtons = $('mode-buttons');
const aloneBtn = $('alone-btn');
const camHint = $('cam-hint');
const countdownEl = $('countdown');
const phaseTimer = $('phase-timer');
const caretaName = $('careta-name');
const noFaceWarning = $('no-face-warning');
const flash = $('flash');
const scoreDisplay = $('score-display');
const resultMenu = $('result-menu');
const infoPopup = $<HTMLDialogElement>('info-popup');
const invitePopup = $<HTMLDialogElement>('invite-popup');

const refFace = new ReferenceFace(refCanvas);
const tracker = createTracker();

const NEUTRAL: Shape = {};
refFace.setShape(NEUTRAL, 0, true);

let currentCareta: Careta | null = null;
let cameraReady = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function show(el: HTMLElement) { el.classList.remove('hidden'); }
function hide(el: HTMLElement) { el.classList.add('hidden'); }

// ------------------------------------------------------------------ menu wiring

playBtn.addEventListener('click', () => {
  hide(playBtn);
  show(modeButtons);
});

for (const id of ['invite-btn', 'invite-btn-2']) {
  $(id).addEventListener('click', () => invitePopup.showModal());
}

$('info-btn').addEventListener('click', () => infoPopup.showModal());

for (const btn of document.querySelectorAll<HTMLButtonElement>('.close-popup')) {
  btn.addEventListener('click', () => (btn.closest('dialog') as HTMLDialogElement).close());
}

aloneBtn.addEventListener('click', async () => {
  camHint.textContent = 'Allow camera access to play!';
  show(camHint);
  try {
    if (!cameraReady) {
      await tracker.start(video);
      cameraReady = true;
    }
    hide(menu);
    show(video);
    startRound();
  } catch (err) {
    console.error(err);
    camHint.textContent = 'Camera access is required to play. Check your browser settings and try again!';
  }
});

$('again-btn').addEventListener('click', () => {
  hide(resultMenu);
  hide(scoreDisplay);
  scoreDisplay.classList.remove('raised');
  hide(freezeCanvas);
  hide(camMesh);
  clearCanvas(refMesh);
  startRound();
});

// ------------------------------------------------------------------ round flow

async function startRound(): Promise<void> {
  currentCareta = randomCareta(currentCareta ?? undefined);
  tracker.setMockTarget({});

  caretaName.textContent = `“${currentCareta.name}”`;
  show(caretaName);

  // Reference face stretches into the careta over the first 2s, then freezes.
  refFace.setShape(currentCareta.shape, 2000, false);

  // 3, 2, 1, GO
  const ticks: Array<[string, string]> = [
    ['3', '#ff5252'],
    ['2', '#ffb300'],
    ['1', '#40c4ff'],
    ['GO!', '#69f0ae'],
  ];
  show(countdownEl);
  for (const [txt, color] of ticks) {
    const span = document.createElement('span');
    span.className = 'tick';
    span.textContent = txt;
    span.style.color = color;
    countdownEl.replaceChildren(span);
    await sleep(850);
  }
  hide(countdownEl);
  countdownEl.replaceChildren();

  await caretaPhase();
}

async function caretaPhase(): Promise<void> {
  const DURATION = 6000;
  const careta = currentCareta!;
  tracker.setMockTarget(careta.shape);

  show(phaseTimer);
  phaseTimer.classList.remove('urgent');

  interface Sample { time: number; shape: Shape; detected: boolean }
  const samples: Sample[] = [];
  const start = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const now = performance.now();
      const left = DURATION - (now - start);
      if (left <= 0) { resolve(); return; }

      const secs = Math.ceil(left / 1000);
      phaseTimer.textContent = String(secs);
      phaseTimer.classList.toggle('urgent', secs <= 2);

      const res = tracker.latest();
      samples.push({ time: now, shape: res.shape, detected: res.faceDetected });
      if (samples.length > 300) samples.shift();
      noFaceWarning.classList.toggle('hidden', res.faceDetected);

      requestAnimationFrame(tick);
    };
    tick();
  });

  hide(phaseTimer);
  hide(noFaceWarning);

  // FLASH — freeze the player
  flash.classList.remove('go');
  void flash.offsetWidth; // restart animation
  flash.classList.add('go');

  const finalResult = tracker.latest();
  freezeVideoFrame();

  // Score on the average of the last 600 ms of detected frames (robust to jitter).
  const end = performance.now();
  const recent = samples.filter((s) => s.detected && end - s.time <= 600).map((s) => s.shape);
  const anyDetected = recent.length > 0 || finalResult.faceDetected;
  const playerShape = recent.length > 0 ? averageShapes(recent) : finalResult.shape;
  const score = anyDetected ? computeScore(playerShape, careta.shape) : 0;

  await sleep(450);
  await scoringPhase(score, finalResult.landmarks);
}

async function scoringPhase(score: number, landmarks: Array<[number, number]> | null): Promise<void> {
  // --- Mesh scan: light up keypoints on both faces
  const SCAN_MS = 1500;
  const refPts = faceMeshPoints(refMesh.clientWidth, refMesh.clientHeight, refFace.getShape());
  const camPts = landmarks ? projectLandmarks(landmarks, camMesh) : [];
  show(camMesh);

  const scanStart = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = Math.min(1, (performance.now() - scanStart) / SCAN_MS);
      drawScan(refMesh, refPts, t);
      drawScan(camMesh, camPts, t);
      if (t >= 1) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });

  // --- Score count-up: 2s, decelerating (ease-out) for drama
  show(scoreDisplay);
  scoreDisplay.classList.remove('final');
  const COUNT_MS = 2000;
  const countStart = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = Math.min(1, (performance.now() - countStart) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      scoreDisplay.textContent = String(Math.round(score * eased));
      if (t >= 1) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });
  scoreDisplay.textContent = String(score);
  scoreDisplay.classList.add('final');

  await sleep(600);
  scoreDisplay.classList.add('raised');
  show(resultMenu);
}

// ------------------------------------------------------------------ rendering helpers

function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

function sizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** object-fit: cover mapping from source (sw × sh) into element (w × h). */
function coverTransform(sw: number, sh: number, w: number, h: number) {
  const scale = Math.max(w / sw, h / sh);
  return { scale, dx: (w - sw * scale) / 2, dy: (h - sh * scale) / 2 };
}

/** Map normalized video landmarks into (mirrored) element pixel coords. */
function projectLandmarks(landmarks: Array<[number, number]>, canvas: HTMLCanvasElement): Array<[number, number]> {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sw = video.videoWidth || 480, sh = video.videoHeight || 640;
  const { scale, dx, dy } = coverTransform(sw, sh, w, h);
  const step = Math.max(1, Math.floor(landmarks.length / 80));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < landmarks.length; i += step) {
    const [nx, ny] = landmarks[i];
    pts.push([w - (nx * sw * scale + dx), ny * sh * scale + dy]); // mirrored x
  }
  return pts;
}

function drawScan(canvas: HTMLCanvasElement, pts: Array<[number, number]>, progress: number): void {
  const ctx = sizeCanvas(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  if (pts.length === 0) return;

  const visible = Math.floor(pts.length * Math.min(1, progress * 1.15));
  // Settle at a faint 30% so the "mapped" mesh stays visible during the score count-up.
  const fade = progress > 0.85 ? Math.max(0.3, 1 - ((progress - 0.85) / 0.15) * 0.7) : 1;

  // Sweeping scanline
  if (progress < 0.9) {
    const y = h * (progress / 0.9);
    const grad = ctx.createLinearGradient(0, y - 40, 0, y + 3);
    grad.addColorStop(0, 'rgba(100,255,218,0)');
    grad.addColorStop(1, 'rgba(100,255,218,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 40, w, 43);
  }

  ctx.globalAlpha = fade;

  // Connect each point to its 2 nearest visible neighbours
  ctx.strokeStyle = 'rgba(100,255,218,0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i < visible; i++) {
    const dists: Array<[number, number]> = [];
    for (let j = Math.max(0, i - 12); j < i; j++) {
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      dists.push([d, j]);
    }
    dists.sort((a, b) => a[0] - b[0]);
    for (const [, j] of dists.slice(0, 2)) {
      ctx.beginPath();
      ctx.moveTo(pts[i][0], pts[i][1]);
      ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.stroke();
    }
  }

  // Glowing keypoints
  for (let i = 0; i < visible; i++) {
    const isNewest = i >= visible - 3;
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], isNewest ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fillStyle = isNewest ? '#b2fff0' : '#64ffda';
    ctx.shadowColor = '#64ffda';
    ctx.shadowBlur = isNewest ? 12 : 5;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function freezeVideoFrame(): void {
  const ctx = sizeCanvas(freezeCanvas);
  const w = freezeCanvas.clientWidth, h = freezeCanvas.clientHeight;
  const sw = video.videoWidth || 480, sh = video.videoHeight || 640;
  const { scale, dx, dy } = coverTransform(sw, sh, w, h);
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1); // mirror to match the live preview
  ctx.drawImage(video, dx, dy, sw * scale, sh * scale);
  ctx.restore();
  show(freezeCanvas);
}
