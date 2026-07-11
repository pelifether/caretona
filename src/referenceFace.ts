import type { Shape } from './blendshapes';
import { get, sym, lerpShape } from './blendshapes';

/**
 * Procedural emoji-style face rendered on a canvas, driven by ARKit-style
 * blendshape values — the same space MediaPipe reports for the player, so a
 * careta preset renders here exactly as it is scored there.
 */

const SKIN = '#FFC93C';
const SKIN_SHADE = '#F0A83B';
const OUTLINE = '#B36B24';
const BROW = '#4A2E19';
const MOUTH_DARK = '#5B1E1E';
const LIP = '#C0392B';

export interface FacePose {
  shape: Shape;
  gazeX: number; // -1..1 (idle eye drift)
  gazeY: number;
}

export function drawFace(ctx: CanvasRenderingContext2D, w: number, h: number, pose: FacePose): void {
  const s = pose.shape;
  const R = Math.min(w, h) * 0.30;
  const cx = w / 2;
  const cy = h / 2;

  const jawOpen = get(s, 'jawOpen');
  const jawShift = (get(s, 'jawRight') - get(s, 'jawLeft')) * 0.14 * R;
  const cheekPuff = get(s, 'cheekPuff');

  ctx.save();
  ctx.translate(cx, cy);

  // ---- Head: top half fixed, bottom half stretches with jawOpen / puffs with cheekPuff
  const rx = R * 0.98;
  const ryTop = R * 1.02;
  const ryBot = R * 1.02 * (1 + jawOpen * 0.30);
  const rxBot = rx * (1 + cheekPuff * 0.16);

  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ryTop, 0, Math.PI, 2 * Math.PI);
  ctx.ellipse(jawShift, 0, rxBot, ryBot, 0, 0, Math.PI);
  const grad = ctx.createRadialGradient(-R * 0.25, -R * 0.35, R * 0.2, 0, 0, R * 1.6);
  grad.addColorStop(0, SKIN);
  grad.addColorStop(1, SKIN_SHADE);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = R * 0.045;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();

  // Cheek-puff highlights
  if (cheekPuff > 0.05) {
    ctx.strokeStyle = `rgba(179,107,36,${0.55 * cheekPuff})`;
    ctx.lineWidth = R * 0.035;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * rxBot * 0.62, R * 0.42, R * 0.34, side < 0 ? Math.PI * 0.7 : Math.PI * 0.05, side < 0 ? Math.PI * 0.95 : Math.PI * 0.3);
      ctx.stroke();
    }
  }

  // ---- Eyes
  for (const side of [-1, 1] as const) {
    const L = side < 0; // face's left = viewer's left here (mirrored player compensates)
    const blink = get(s, L ? 'eyeBlinkLeft' : 'eyeBlinkRight');
    const wide = get(s, L ? 'eyeWideLeft' : 'eyeWideRight');
    const squint = get(s, L ? 'eyeSquintLeft' : 'eyeSquintRight');

    const ex = side * R * 0.40;
    const ey = -R * 0.18;
    const erx = R * 0.185 * (1 + wide * 0.12);
    const openTop = (1 - blink) * (1 + wide * 0.45);
    const openBot = (1 - blink) * (1 - squint * 0.65);
    const eryT = R * 0.16 * Math.max(0, openTop);
    const eryB = R * 0.16 * Math.max(0, openBot);

    if (blink > 0.85) {
      // Closed eye: a happy arc
      ctx.beginPath();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = R * 0.05;
      ctx.lineCap = 'round';
      ctx.arc(ex, ey - R * 0.02, erx * 0.85, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      continue;
    }

    ctx.beginPath();
    ctx.ellipse(ex, ey, erx, eryT, 0, Math.PI, 2 * Math.PI);
    ctx.ellipse(ex, ey, erx, eryB, 0, 0, Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = R * 0.035;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    ctx.save();
    ctx.clip();
    const pr = R * 0.085 * (1 + wide * 0.1);
    const px = ex + pose.gazeX * erx * 0.45;
    const py = ey + pose.gazeY * Math.max(eryT, eryB) * 0.4;
    ctx.beginPath();
    ctx.arc(px, py, pr * 1.7, 0, Math.PI * 2);
    ctx.fillStyle = '#7A4B1F';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = '#221510';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - pr * 0.4, py - pr * 0.45, pr * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();
  }

  // ---- Brows
  const browInnerUp = get(s, 'browInnerUp');
  for (const side of [-1, 1] as const) {
    const L = side < 0;
    const down = get(s, L ? 'browDownLeft' : 'browDownRight');
    const outerUp = get(s, L ? 'browOuterUpLeft' : 'browOuterUpRight');
    const bx = side * R * 0.40;
    const by = -R * 0.46;
    const innerY = by - browInnerUp * R * 0.14 + down * R * 0.13;
    const outerY = by - outerUp * R * 0.15 + down * R * 0.07;
    const midY = Math.min(innerY, outerY) - R * 0.05;

    ctx.beginPath();
    ctx.moveTo(bx - side * R * 0.20, innerY);
    ctx.quadraticCurveTo(bx, midY, bx + side * R * 0.22, outerY);
    ctx.strokeStyle = BROW;
    ctx.lineWidth = R * 0.075;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // ---- Nose (sneer lifts it and wrinkles the bridge)
  const sneer = sym(s, 'noseSneer');
  const ny = R * 0.12 - sneer * R * 0.06;
  ctx.beginPath();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = R * 0.045;
  ctx.lineCap = 'round';
  ctx.moveTo(-R * 0.09, ny + R * 0.10);
  ctx.quadraticCurveTo(0, ny + R * 0.16 - sneer * R * 0.05, R * 0.09, ny + R * 0.10);
  ctx.stroke();
  if (sneer > 0.15) {
    ctx.lineWidth = R * 0.028;
    ctx.strokeStyle = `rgba(179,107,36,${0.7 * sneer})`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * R * 0.13, ny - R * 0.02);
      ctx.quadraticCurveTo(side * R * 0.20, ny - R * 0.10, side * R * 0.16, ny - R * 0.18);
      ctx.stroke();
    }
  }

  // ---- Mouth
  drawMouth(ctx, s, R, jawShift);

  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, s: Shape, R: number, jawShift: number): void {
  const jawOpen = get(s, 'jawOpen');
  const smile = sym(s, 'mouthSmile');
  const frown = sym(s, 'mouthFrown');
  const stretch = sym(s, 'mouthStretch');
  const press = sym(s, 'mouthPress');
  const pucker = get(s, 'mouthPucker');
  const funnel = get(s, 'mouthFunnel');
  const upperUp = sym(s, 'mouthUpperUp');
  const lowerDown = sym(s, 'mouthLowerDown');
  const shrugLower = get(s, 'mouthShrugLower');
  const close = get(s, 'mouthClose');
  const shiftX = (get(s, 'mouthRight') - get(s, 'mouthLeft')) * R * 0.22 + jawShift * 0.8;

  const my = R * 0.52 + jawOpen * R * 0.14 - shrugLower * R * 0.07;
  const round = Math.max(pucker, funnel * 0.8);
  const halfW = R * 0.34
    * (1 + stretch * 0.40 + smile * 0.18)
    * (1 - round * 0.62);

  // Lip gap: how far apart the lips are vertically
  let gap = jawOpen * R * 0.42 + funnel * R * 0.18 + (upperUp + lowerDown) * R * 0.05;
  gap *= (1 - close * 0.85);
  gap *= (1 - press * 0.9);
  if (pucker > 0.5 && funnel < 0.3) gap = Math.min(gap, R * 0.10);

  const cornerY = (-smile * 0.26 + frown * 0.22 + stretch * 0.05) * R;
  const upperY = my - gap / 2 - upperUp * R * 0.05;
  const lowerY = my + gap / 2 + lowerDown * R * 0.05 - shrugLower * R * 0.10;

  ctx.save();
  ctx.translate(shiftX, 0);
  ctx.lineJoin = 'round';

  if (gap < R * 0.045) {
    // Closed mouth: a single expressive line
    ctx.beginPath();
    ctx.moveTo(-halfW, my + cornerY);
    ctx.quadraticCurveTo(0, my - cornerY * 1.1 + (shrugLower + press * 0.4) * -R * 0.06, halfW, my + cornerY);
    ctx.strokeStyle = MOUTH_DARK;
    ctx.lineWidth = R * (0.055 + press * 0.02);
    ctx.lineCap = 'round';
    ctx.stroke();
    if (shrugLower > 0.3) {
      // Pout crease under the lip
      ctx.beginPath();
      ctx.moveTo(-halfW * 0.6, my + R * 0.12);
      ctx.quadraticCurveTo(0, my + R * 0.20, halfW * 0.6, my + R * 0.12);
      ctx.strokeStyle = `rgba(91,30,30,${shrugLower * 0.6})`;
      ctx.lineWidth = R * 0.03;
      ctx.stroke();
    }
  } else {
    // Open mouth
    ctx.beginPath();
    ctx.moveTo(-halfW, my + cornerY);
    ctx.quadraticCurveTo(0, upperY - R * 0.04, halfW, my + cornerY);
    ctx.quadraticCurveTo(0, lowerY + R * 0.10, -halfW, my + cornerY);
    ctx.closePath();
    ctx.fillStyle = MOUTH_DARK;
    ctx.fill();
    ctx.strokeStyle = LIP;
    ctx.lineWidth = R * (0.05 + round * 0.045);
    ctx.stroke();

    // Teeth
    ctx.save();
    ctx.clip();
    const teeth = Math.max(upperUp, jawOpen * 0.5, smile * 0.4) * (1 - round);
    if (teeth > 0.12) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-halfW, upperY - R * 0.02, halfW * 2, R * (0.06 + teeth * 0.10));
    }
    if (lowerDown > 0.25 && round < 0.4) {
      ctx.fillStyle = '#F3F0E8';
      ctx.fillRect(-halfW, lowerY - R * (0.04 + lowerDown * 0.06), halfW * 2, R * 0.12);
    }
    ctx.restore();
  }

  // Pucker/funnel radial lip creases
  if (round > 0.45) {
    ctx.strokeStyle = `rgba(179,60,40,${(round - 0.45) * 1.2})`;
    ctx.lineWidth = R * 0.025;
    ctx.lineCap = 'round';
    const n = 8;
    const rr = Math.max(halfW, gap / 2) + R * 0.075;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, my + Math.sin(a) * (gap / 2 + R * 0.075));
      ctx.lineTo(Math.cos(a) * (rr + R * 0.06), my + Math.sin(a) * (gap / 2 + R * 0.13));
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Feature anchor points (canvas coords) used by the scoring "mesh scan" animation. */
export function faceMeshPoints(w: number, h: number, s: Shape): Array<[number, number]> {
  const R = Math.min(w, h) * 0.30;
  const cx = w / 2, cy = h / 2;
  const jawOpen = get(s, 'jawOpen');
  const my = R * 0.52 + jawOpen * R * 0.14;
  const pts: Array<[number, number]> = [];
  const add = (x: number, y: number) => pts.push([cx + x, cy + y]);
  // Face oval
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(Math.cos(a) * R * 0.95, Math.sin(a) * R * (a < Math.PI ? 1.0 + jawOpen * 0.28 : 1.0));
  }
  for (const side of [-1, 1]) {
    add(side * R * 0.40, -R * 0.18);                     // eye centers
    add(side * R * 0.55, -R * 0.18); add(side * R * 0.25, -R * 0.18); // eye corners
    add(side * R * 0.40, -R * 0.50);                     // brows
    add(side * R * 0.34, my);                            // mouth corners
  }
  add(0, R * 0.20);            // nose
  add(0, my - R * 0.12);       // upper lip
  add(0, my + jawOpen * R * 0.30 + R * 0.12); // lower lip
  return pts;
}

/** Handles idle life (blinks, eye drift) and animated transitions between shapes. */
export class ReferenceFace {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private current: Shape = {};
  private from: Shape = {};
  private target: Shape = {};
  private transStart = 0;
  private transDur = 0;
  private idle = true;
  private nextBlink = performance.now() + 1500;
  private blinkStart = -1;
  private gazeX = 0; private gazeY = 0;
  private gazeTargetX = 0; private gazeTargetY = 0;
  private nextGaze = 0;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Animate to a shape over `dur` ms; idle life disabled unless `idle`. */
  setShape(shape: Shape, dur = 0, idle = false): void {
    this.from = { ...this.current };
    this.target = shape;
    this.transStart = performance.now();
    this.transDur = dur;
    this.idle = idle;
  }

  getShape(): Shape {
    return this.current;
  }

  private loop(now: number): void {
    const { canvas, ctx } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) { this.raf = requestAnimationFrame(this.loop); return; }
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Transition
    const t = this.transDur > 0 ? Math.min(1, (now - this.transStart) / this.transDur) : 1;
    const eased = 1 - Math.pow(1 - t, 3);
    this.current = lerpShape(this.from, this.target, eased);

    let shape = this.current;
    if (this.idle) {
      // Blinks
      if (this.blinkStart < 0 && now >= this.nextBlink) {
        this.blinkStart = now;
        this.nextBlink = now + 1800 + Math.random() * 3200;
      }
      let blink = 0;
      if (this.blinkStart >= 0) {
        const bt = (now - this.blinkStart) / 240;
        blink = bt >= 1 ? 0 : Math.sin(bt * Math.PI);
        if (bt >= 1) this.blinkStart = -1;
      }
      // Eye drift
      if (now >= this.nextGaze) {
        this.gazeTargetX = (Math.random() * 2 - 1) * 0.8;
        this.gazeTargetY = (Math.random() * 2 - 1) * 0.4;
        this.nextGaze = now + 1200 + Math.random() * 2500;
      }
      this.gazeX += (this.gazeTargetX - this.gazeX) * 0.06;
      this.gazeY += (this.gazeTargetY - this.gazeY) * 0.06;
      shape = { ...shape, eyeBlinkLeft: Math.max(get(shape, 'eyeBlinkLeft'), blink), eyeBlinkRight: Math.max(get(shape, 'eyeBlinkRight'), blink) };
    } else {
      this.gazeX *= 0.9;
      this.gazeY *= 0.9;
    }

    drawFace(ctx, w, h, { shape, gazeX: this.gazeX, gazeY: this.gazeY });
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }
}
