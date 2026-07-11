import type { Shape } from './blendshapes';
import { get, lerpShape } from './blendshapes';
import { drawToonFace } from './faces/toon';
import { drawHumanFace } from './faces/human';

export interface FacePose {
  shape: Shape;
  gazeX: number; // -1..1 (idle eye drift)
  gazeY: number;
}

export type FaceStyle = 'toon' | 'human';

const STYLE_KEY = 'caretona-face-style';

export function loadFaceStyle(): FaceStyle {
  return localStorage.getItem(STYLE_KEY) === 'human' ? 'human' : 'toon';
}

export function saveFaceStyle(style: FaceStyle): void {
  localStorage.setItem(STYLE_KEY, style);
}

/** Feature anchor points (canvas coords) used by the scoring "mesh scan" animation. */
export function faceMeshPoints(w: number, h: number, s: Shape): Array<[number, number]> {
  const R = Math.min(w, h) * 0.30;
  const cx = w / 2, cy = h / 2;
  const jawOpen = get(s, 'jawOpen');
  const my = R * 0.52 + jawOpen * R * 0.14;
  const pts: Array<[number, number]> = [];
  const add = (x: number, y: number) => pts.push([cx + x, cy + y]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(Math.cos(a) * R * 0.95, Math.sin(a) * R * (a < Math.PI ? 1.0 + jawOpen * 0.28 : 1.0));
  }
  for (const side of [-1, 1]) {
    add(side * R * 0.40, -R * 0.18);
    add(side * R * 0.55, -R * 0.18); add(side * R * 0.25, -R * 0.18);
    add(side * R * 0.40, -R * 0.50);
    add(side * R * 0.34, my);
  }
  add(0, R * 0.20);
  add(0, my - R * 0.12);
  add(0, my + jawOpen * R * 0.30 + R * 0.12);
  return pts;
}

/** Handles idle life (blinks, eye drift) and animated transitions between shapes. */
export class ReferenceFace {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private style: FaceStyle = loadFaceStyle();
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

  getStyle(): FaceStyle {
    return this.style;
  }

  toggleStyle(): FaceStyle {
    this.style = this.style === 'toon' ? 'human' : 'toon';
    saveFaceStyle(this.style);
    return this.style;
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

    const t = this.transDur > 0 ? Math.min(1, (now - this.transStart) / this.transDur) : 1;
    const eased = 1 - Math.pow(1 - t, 3);
    this.current = lerpShape(this.from, this.target, eased);

    let shape = this.current;
    if (this.idle) {
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

    const pose: FacePose = { shape, gazeX: this.gazeX, gazeY: this.gazeY };
    if (this.style === 'human') drawHumanFace(ctx, w, h, pose);
    else drawToonFace(ctx, w, h, pose);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }
}
