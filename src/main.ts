import './style.css';
import { ReferenceFace, faceMeshPoints } from './referenceFace';
import { CARETAS, randomCareta, type Careta } from './caretas';
import { REAL_FACES } from './realFaces';
import { createTracker } from './tracker';
import { computeScore, averageShapes, scoreTag } from './scoring';
import type { Shape } from './blendshapes';
import type { Session, HostHandle } from './net';

// ------------------------------------------------------------------ elements

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const qs = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

const refCanvas = $<HTMLCanvasElement>('ref-canvas');
const refMesh = $<HTMLCanvasElement>('ref-mesh');
const meshSelf = $<HTMLCanvasElement>('mesh-self');
const meshFriend = $<HTMLCanvasElement>('mesh-friend');
const freezeSelf = $<HTMLCanvasElement>('freeze-self');
const freezeFriend = $<HTMLCanvasElement>('freeze-friend');
const video = $<HTMLVideoElement>('cam');
const camRemote = $<HTMLVideoElement>('cam-remote');
const paneSelf = $('pane-self');
const paneFriend = $('pane-friend');
const bottomHalf = $('bottom-half');
const menu = $('menu');
const playBtn = $('play-btn');
const modeButtons = $('mode-buttons');
const camHint = $('cam-hint');
const countdownEl = $('countdown');
const phaseTimer = $('phase-timer');
const caretaName = $('careta-name');
const noFaceWarning = $('no-face-warning');
const flash = $('flash');
const resultMenu = $('result-menu');
const againBtn = $('again-btn');
const inviteBtn2 = $('invite-btn-2');
const byeBtn = $('bye-btn');
const friendReadyChip = $('friend-ready-chip');
const waiting = $('waiting');
const waitingText = $('waiting-text');
const cancelInviteBtn = $('cancel-invite-btn');
const toast = $('toast');
const infoPopup = $<HTMLDialogElement>('info-popup');
const mpPopup = $<HTMLDialogElement>('mp-popup');

const scoreSelf = $('score-self');
const scoreFriend = $('score-friend');

const refFace = new ReferenceFace(refCanvas);
const tracker = createTracker();

// ------------------------------------------------------------------ state

type Mode = 'solo' | 'host' | 'guest';

/** What this round's reference is: an authored careta or a real photo. */
interface RoundTarget {
  shape: Shape;
  careta: Careta | null;
  photo: number | null;
}

let mode: Mode = 'solo';
let session: Session | null = null;
let hostHandle: HostHandle | null = null;
let currentCareta: Careta | null = null;
let lastPhoto = -1;
let currentTarget: RoundTarget | null = null;
let cameraReady = false;
let selfReady = false;
let friendReady = false;
let atResults = false;
let leavingIntentionally = false;
let remoteResult: { v: number; pts: Array<[number, number]> | null } | null = null;
let roundToken = 0;

const guestRoomId = new URLSearchParams(location.search).get('join');

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function show(el: HTMLElement) { el.classList.remove('hidden'); }
function hide(el: HTMLElement) { el.classList.add('hidden'); }

function showToast(msg: string, ms = 2200): void {
  toast.textContent = msg;
  show(toast);
  setTimeout(() => hide(toast), ms);
}

function mpNotice(title: string, text: string, offerAlone = false): void {
  $('mp-popup-title').textContent = title;
  $('mp-popup-text').textContent = text;
  $('mp-alone-btn').classList.toggle('hidden', !offerAlone);
  if (!mpPopup.open) mpPopup.showModal();
}

// ------------------------------------------------------------------ high score

const HS_KEY = 'caretona-high-score';
const highScoreEl = $('high-score');
let highScore = Number(localStorage.getItem(HS_KEY)) || 0;

/** Show the local record at results; celebrate when it's beaten. */
function presentHighScore(score: number): void {
  const beaten = score > highScore;
  if (beaten) {
    highScore = score;
    localStorage.setItem(HS_KEY, String(highScore));
  }
  qs<HTMLElement>('#high-score .hs-num').textContent = String(highScore);
  show(highScoreEl);
  highScoreEl.classList.remove('pop');
  if (beaten) {
    void highScoreEl.offsetWidth; // restart animation
    highScoreEl.classList.add('pop');
  }
}

// ------------------------------------------------------------------ static wiring

$('info-btn').addEventListener('click', () => infoPopup.showModal());
for (const btn of document.querySelectorAll<HTMLButtonElement>('.close-popup')) {
  btn.addEventListener('click', () => (btn.closest('dialog') as HTMLDialogElement).close());
}

const styleBtn = $('style-btn');
styleBtn.addEventListener('click', async () => {
  if (styleBtn.classList.contains('loading')) return;
  styleBtn.classList.add('loading');
  try {
    await refFace.toggleStyle();
  } catch (err) {
    console.error(err);
    showToast('3D face failed to load — check your connection');
  } finally {
    styleBtn.classList.remove('loading');
  }
});

if (new URLSearchParams(location.search).has('mock')) {
  // Test hook: pose the reference face directly (used by scripts/face-gallery.mjs).
  (window as unknown as Record<string, unknown>).__setFacePose = async (style: '3d' | 'photo', name: string) => {
    await refFace.setStyle(style);
    const careta = CARETAS.find((c) => c.name === name);
    refFace.setShape(careta ? careta.shape : {}, 200, !careta);
  };
}

if (guestRoomId) {
  // Arriving through an invite link: PLAY becomes JOIN.
  playBtn.innerHTML =
    '<span style="--c:#ff5252">J</span><span style="--c:#ffb300">O</span><span style="--c:#40c4ff">I</span><span style="--c:#69f0ae">N</span>';
}

playBtn.addEventListener('click', () => {
  if (guestRoomId) {
    void joinAsGuest(guestRoomId);
  } else {
    hide(playBtn);
    show(modeButtons);
  }
});

$('alone-btn').addEventListener('click', async () => {
  if (!(await ensureCamera())) return;
  hide(menu);
  void beginRound(pickTarget());
});

$('invite-btn').addEventListener('click', () => void startHosting());
inviteBtn2.addEventListener('click', () => void startHosting());

againBtn.addEventListener('click', () => {
  if (mode === 'solo') {
    resetRoundUI();
    void beginRound(pickTarget());
  } else {
    selfReady = true;
    againBtn.classList.add('pressed');
    againBtn.textContent = 'READY ✓';
    session?.send({ t: 'ready' });
    maybeStartNextMultiRound();
  }
});

byeBtn.addEventListener('click', () => {
  leavingIntentionally = true;
  session?.send({ t: 'bye' });
  setTimeout(() => exitMultiplayer(), 150); // let the message flush
});

cancelInviteBtn.addEventListener('click', () => {
  hostHandle?.cancel();
  hostHandle = null;
  exitMultiplayer();
});

$('mp-alone-btn').addEventListener('click', async () => {
  mpPopup.close();
  if (!(await ensureCamera())) return;
  hide(menu);
  resetRoundUI();
  void beginRound(pickTarget());
});

// ------------------------------------------------------------------ camera

async function ensureCamera(): Promise<boolean> {
  if (cameraReady) return true;
  camHint.textContent = 'Allow camera access to play!';
  show(camHint);
  try {
    await tracker.start(video);
    cameraReady = true;
    hide(camHint);
    show(video);
    return true;
  } catch (err) {
    console.error(err);
    camHint.textContent = 'Camera access is required to play. Check your browser settings and try again!';
    return false;
  }
}

// ------------------------------------------------------------------ multiplayer

async function startHosting(): Promise<void> {
  if (!(await ensureCamera())) return;
  const { hostRoom } = await import('./net');

  resetRoundUI();
  hide(menu);
  refFace.setShape({}, 400, true);
  hide(caretaName);

  mode = 'host';
  bottomHalf.classList.add('split');
  show(paneFriend);
  waitingText.textContent = 'Waiting for friend…';
  show(waiting);
  show(cancelInviteBtn);

  try {
    hostHandle = await hostRoom(tracker.getStream()!);
  } catch (err) {
    console.error(err);
    mpNotice('Connection failed', 'Could not reach the matchmaking service. Try again in a moment!');
    exitMultiplayer();
    return;
  }

  (window as unknown as Record<string, unknown>).__caretonaLink = hostHandle.link;
  void shareLink(hostHandle.link);

  const mySession = await hostHandle.guest; // never resolves if cancelled
  if (mode !== 'host' || !hostHandle) return;
  session = mySession;
  wireSession();
  hide(waiting);

  await sleep(600); // let media streams settle
  startNextMultiRound();
}

async function joinAsGuest(roomId: string): Promise<void> {
  if (!(await ensureCamera())) return;
  const { joinRoom } = await import('./net');

  resetRoundUI();
  hide(menu);
  mode = 'guest';
  bottomHalf.classList.add('split');
  show(paneFriend);
  waitingText.textContent = 'Connecting…';
  show(waiting);
  hide(cancelInviteBtn);

  try {
    session = await joinRoom(roomId, tracker.getStream()!);
  } catch {
    exitMultiplayer();
    mpNotice('This invite has been cancelled', 'Ask your friend for a fresh link!', true);
    history.replaceState(null, '', location.pathname + (new URLSearchParams(location.search).has('mock') ? '?mock=1' : ''));
    return;
  }
  wireSession();
  waitingText.textContent = 'Starting…';
}

function wireSession(): void {
  if (!session) return;
  session.onRemoteStream = (stream) => {
    camRemote.srcObject = stream;
    void camRemote.play().catch(() => {});
    hide(waiting);
  };
  session.onMessage = (msg) => {
    if (msg.t === 'start') {
      resetRoundUI();
      void beginRound(
        msg.photo !== undefined
          ? { shape: REAL_FACES[msg.photo].shape, careta: null, photo: msg.photo }
          : { shape: CARETAS[msg.careta].shape, careta: CARETAS[msg.careta], photo: null },
      );
    } else if (msg.t === 'score') {
      remoteResult = { v: msg.v, pts: msg.pts };
    } else if (msg.t === 'ready') {
      friendReady = true;
      if (atResults) show(friendReadyChip);
      maybeStartNextMultiRound();
    } else if (msg.t === 'bye') {
      leavingIntentionally = true;
      exitMultiplayer();
      mpNotice('Friend left', 'Your friend left the game 👋');
    }
  };
  session.onClose = () => {
    if (leavingIntentionally) return;
    exitMultiplayer();
    mpNotice('Disconnected', 'Connection to your friend was lost 😢');
  };
}

function maybeStartNextMultiRound(): void {
  if (mode === 'host' && selfReady && friendReady) startNextMultiRound();
}

function startNextMultiRound(): void {
  const target = pickTarget();
  session?.send({
    t: 'start',
    careta: target.careta ? CARETAS.indexOf(target.careta) : -1,
    ...(target.photo !== null ? { photo: target.photo } : {}),
  });
  resetRoundUI();
  void beginRound(target);
}

function exitMultiplayer(): void {
  const wasAtResults = atResults;
  roundToken++; // abort any round in flight
  session?.close();
  session = null;
  hostHandle = null;
  mode = 'solo';
  leavingIntentionally = false;
  remoteResult = null;
  selfReady = friendReady = false;

  camRemote.srcObject = null;
  camRemote.classList.remove('bubble');
  bottomHalf.classList.remove('split');
  hide(paneFriend);
  hide(waiting);
  paneSelf.classList.remove('winner');
  paneFriend.classList.remove('winner');
  hide(scoreFriend);
  hide(friendReadyChip);

  if (wasAtResults) {
    configureResultButtons();
  } else {
    resetRoundUI();
    hide(caretaName);
    refFace.setShape({}, 400, true);
    show(menu);
    if (!guestRoomId) {
      hide(playBtn);
      show(modeButtons);
    } else {
      show(playBtn);
    }
  }
}

async function shareLink(link: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Caretona', text: 'Duvido você ganhar de mim no jogo da Caretona 😜', url: link });
      return;
    } catch { /* fall through to clipboard */ }
  }
  try {
    await navigator.clipboard.writeText(link);
    showToast('Invite link copied! Send it to your friend');
  } catch {
    showToast('Copy the link from the address bar');
  }
}

// ------------------------------------------------------------------ round flow

function pickTarget(): RoundTarget {
  if (refFace.getStyle() === 'photo' && REAL_FACES.length > 0) {
    let idx: number;
    do {
      idx = Math.floor(Math.random() * REAL_FACES.length);
    } while (REAL_FACES.length > 1 && idx === lastPhoto);
    lastPhoto = idx;
    return { shape: REAL_FACES[idx].shape, careta: null, photo: idx };
  }
  currentCareta = randomCareta(currentCareta ?? undefined);
  return { shape: currentCareta.shape, careta: currentCareta, photo: null };
}

function resetRoundUI(): void {
  hide(resultMenu);
  againBtn.classList.remove('pressed');
  againBtn.textContent = 'PLAY AGAIN';
  hide(friendReadyChip);
  atResults = false;
  selfReady = friendReady = false;
  remoteResult = null;

  hide(highScoreEl);
  highScoreEl.classList.remove('pop');
  for (const wrap of [scoreSelf, scoreFriend]) {
    hide(wrap);
    wrap.classList.remove('final', 'raised');
  }
  for (const c of [freezeSelf, freezeFriend, meshSelf, meshFriend, refMesh]) {
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    if (c !== refMesh) hide(c);
  }
  video.classList.remove('bubble');
  camRemote.classList.remove('bubble');
  paneSelf.classList.remove('winner');
  paneFriend.classList.remove('winner');
}

async function beginRound(target: RoundTarget): Promise<void> {
  const token = ++roundToken;
  currentTarget = target;
  tracker.setMockTarget({});

  if (target.photo !== null) {
    // Photo rounds have no names; the roulette decelerates through the
    // countdown and locks on the chosen face at GO.
    hide(caretaName);
    try {
      await refFace.settlePhoto(target.photo, 3300);
    } catch (err) {
      console.error(err);
      showToast('Could not load face photos');
      return;
    }
    if (token !== roundToken) return;
  } else {
    caretaName.textContent = `“${target.careta!.name}”`;
    show(caretaName);
    refFace.setShape(target.shape, 2000, false);
  }

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
    if (token !== roundToken) { hide(countdownEl); return; }
  }
  hide(countdownEl);
  countdownEl.replaceChildren();

  await caretaPhase(token);
}

async function caretaPhase(token: number): Promise<void> {
  const DURATION = 6000;
  const target = currentTarget!;
  tracker.setMockTarget(target.shape);

  show(phaseTimer);
  phaseTimer.classList.remove('urgent');

  interface Sample { time: number; shape: Shape; detected: boolean }
  const samples: Sample[] = [];
  const start = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (token !== roundToken) { resolve(); return; }
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
  if (token !== roundToken) return;

  // FLASH — freeze everyone
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');

  const finalResult = tracker.latest();
  freezeVideoFrame(video, freezeSelf, true);
  if (mode !== 'solo') freezeVideoFrame(camRemote, freezeFriend, false);

  const end = performance.now();
  const recent = samples.filter((s) => s.detected && end - s.time <= 600).map((s) => s.shape);
  const anyDetected = recent.length > 0 || finalResult.faceDetected;
  const playerShape = recent.length > 0 ? averageShapes(recent) : finalResult.shape;
  const score = anyDetected ? computeScore(playerShape, target.shape) : 0;

  if (mode !== 'solo') {
    session?.send({ t: 'score', v: score, pts: subsample(finalResult.landmarks) });
  }

  await sleep(450);
  if (token !== roundToken) return;
  await scoringPhase(token, score, finalResult.landmarks);
}

async function scoringPhase(token: number, score: number, landmarks: Array<[number, number]> | null): Promise<void> {
  const multi = mode !== 'solo';

  // In multiplayer, give the friend's score message a moment to arrive.
  if (multi) {
    const deadline = performance.now() + 3500;
    while (!remoteResult && performance.now() < deadline && token === roundToken) await sleep(80);
  }
  if (token !== roundToken) return;

  // --- Mesh scan (canvases must be visible BEFORE projecting: hidden = 0×0)
  const SCAN_MS = 1500;
  show(meshSelf);
  if (multi) show(meshFriend);
  const refPts = referencePoints();
  const selfPts = landmarks ? projectLandmarks(subsample(landmarks)!, meshSelf, video, true) : [];
  const friendPts = multi && remoteResult?.pts
    ? projectLandmarks(remoteResult.pts, meshFriend, camRemote, false)
    : [];

  const scanStart = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (token !== roundToken) { resolve(); return; }
      const t = Math.min(1, (performance.now() - scanStart) / SCAN_MS);
      drawScan(refMesh, refPts, t);
      drawScan(meshSelf, selfPts, t);
      if (multi) drawScan(meshFriend, friendPts, t);
      if (t >= 1) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });
  // Scan done — remove every trace of the mesh overlays.
  for (const c of [refMesh, meshSelf, meshFriend]) {
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  }
  hide(meshSelf);
  hide(meshFriend);
  if (token !== roundToken) return;

  // --- Count-up (2s, decelerating)
  const numSelf = qs<HTMLElement>('#score-self .score-num');
  const numFriend = qs<HTMLElement>('#score-friend .score-num');
  show(scoreSelf);
  if (multi) show(scoreFriend);

  const friendScore = remoteResult?.v ?? 0;
  const COUNT_MS = 2000;
  const countStart = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (token !== roundToken) { resolve(); return; }
      const t = Math.min(1, (performance.now() - countStart) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      numSelf.textContent = String(Math.round(score * eased));
      if (multi) numFriend.textContent = String(Math.round(friendScore * eased));
      if (t >= 1) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });
  if (token !== roundToken) return;

  finalizeScore(scoreSelf, score);
  if (multi) {
    finalizeScore(scoreFriend, friendScore);
    if (score !== friendScore) {
      (score > friendScore ? paneSelf : paneFriend).classList.add('winner');
    }
  }

  await sleep(600);
  if (token !== roundToken) return;

  // --- Results
  scoreSelf.classList.add('raised');
  if (multi) scoreFriend.classList.add('raised');

  // Live cam bubbles over the frozen frames
  video.classList.add('bubble');
  if (multi) camRemote.classList.add('bubble');
  presentHighScore(score);

  atResults = true;
  configureResultButtons();
  if (multi && friendReady) show(friendReadyChip);
  show(resultMenu);
}

function configureResultButtons(): void {
  const multi = mode !== 'solo';
  byeBtn.classList.toggle('hidden', !multi);
  inviteBtn2.classList.toggle('hidden', multi);
}

function finalizeScore(wrap: HTMLElement, score: number): void {
  const tag = scoreTag(score);
  const tagEl = wrap.querySelector('.score-tag') as HTMLElement;
  const numEl = wrap.querySelector('.score-num') as HTMLElement;
  numEl.textContent = String(score);
  tagEl.textContent = tag.label;
  tagEl.style.color = tag.color;
  wrap.classList.add('final');
}

// ------------------------------------------------------------------ rendering helpers

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

/** Scan points for the reference: real landmarks on photo rounds, synthetic otherwise. */
function referencePoints(): Array<[number, number]> {
  const photo = currentTarget?.photo ?? null;
  if (photo !== null) {
    const { x, y, size } = refFace.photoRect();
    return REAL_FACES[photo].pts.map(([nx, ny]) => [x + nx * size, y + ny * size]);
  }
  return faceMeshPoints(refMesh.clientWidth, refMesh.clientHeight, refFace.getShape());
}

function subsample(landmarks: Array<[number, number]> | null): Array<[number, number]> | null {
  if (!landmarks) return null;
  const step = Math.max(1, Math.floor(landmarks.length / 80));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < landmarks.length; i += step) out.push(landmarks[i]);
  return out;
}

/** Map normalized video landmarks into element pixel coords. */
function projectLandmarks(
  landmarks: Array<[number, number]>,
  canvas: HTMLCanvasElement,
  videoEl: HTMLVideoElement,
  mirror: boolean,
): Array<[number, number]> {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sw = videoEl.videoWidth || 480, sh = videoEl.videoHeight || 640;
  const { scale, dx, dy } = coverTransform(sw, sh, w, h);
  return landmarks.map(([nx, ny]) => {
    const x = nx * sw * scale + dx;
    return [mirror ? w - x : x, ny * sh * scale + dy];
  });
}

function drawScan(canvas: HTMLCanvasElement, pts: Array<[number, number]>, progress: number): void {
  const ctx = sizeCanvas(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  if (pts.length === 0) return;

  const visible = Math.floor(pts.length * Math.min(1, progress * 1.15));
  // Fade the mesh out completely by the end of the scan.
  const fade = progress > 0.8 ? Math.max(0, 1 - (progress - 0.8) / 0.2) : 1;

  if (progress < 0.9) {
    const y = h * (progress / 0.9);
    const grad = ctx.createLinearGradient(0, y - 40, 0, y + 3);
    grad.addColorStop(0, 'rgba(100,255,218,0)');
    grad.addColorStop(1, 'rgba(100,255,218,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 40, w, 43);
  }

  ctx.globalAlpha = fade;

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

function freezeVideoFrame(videoEl: HTMLVideoElement, canvas: HTMLCanvasElement, mirror: boolean): void {
  // Unhide BEFORE measuring: a display:none canvas reports 0×0 and the
  // frozen frame would silently come out blank (black rectangle bug).
  show(canvas);
  const ctx = sizeCanvas(canvas);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sw = videoEl.videoWidth || 480, sh = videoEl.videoHeight || 640;
  const { scale, dx, dy } = coverTransform(sw, sh, w, h);
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  try {
    ctx.drawImage(videoEl, dx, dy, sw * scale, sh * scale);
  } catch { /* remote stream may not have a frame yet */ }
  ctx.restore();
}
