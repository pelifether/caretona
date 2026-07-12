import type { Shape } from './blendshapes';
import { get, lerpShape } from './blendshapes';
import { drawToonFace } from './faces/toon';
import { drawHumanFace } from './faces/human';
import { REAL_FACES } from './realFaces';
import type { Avatar3D } from './faces/avatar3d';

export interface FacePose {
  shape: Shape;
  gazeX: number; // -1..1 (idle eye drift)
  gazeY: number;
}

export type FaceStyle = 'toon' | 'human' | '3d' | 'photo';

const STYLE_ORDER: FaceStyle[] = ['toon', 'human', '3d', 'photo'];
const STYLE_KEY = 'caretona-face-style';

export function loadFaceStyle(): FaceStyle {
  const v = localStorage.getItem(STYLE_KEY);
  return v === 'human' || v === '3d' || v === 'photo' ? v : 'toon';
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
  private avatar: Avatar3D | null = null;
  private avatarLoading: Promise<Avatar3D> | null = null;
  private photos: HTMLImageElement[] | null = null;
  private photosLoading: Promise<void> | null = null;
  private photoIdx = 0;
  private nextFlip = 0;
  /** A photo round is in progress: photos render regardless of style. */
  private photoRound = false;
  private settleTarget = -1;
  private settleStart = 0;
  private settleDur = 0;
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
    // If 3D/photo was the saved style, load in the background; the 2D toon
    // face fills in until assets are ready.
    if (this.style === '3d') this.ensureAvatar().catch(() => { this.style = 'toon'; });
    if (this.style === 'photo') this.ensurePhotos().catch(() => { this.style = 'toon'; });
  }

  /** Animate to a shape over `dur` ms; idle life disabled unless `idle`. */
  setShape(shape: Shape, dur = 0, idle = false): void {
    this.photoRound = false;
    this.settleTarget = -1;
    this.from = { ...this.current };
    this.target = shape;
    this.transStart = performance.now();
    this.transDur = dur;
    this.idle = idle;
  }

  /**
   * Photo round: slot-machine roulette that decelerates over `durMs`
   * (the countdown) and lands on photo `idx`. Resolves once images exist.
   */
  async settlePhoto(idx: number, durMs: number): Promise<void> {
    await this.ensurePhotos();
    this.photoRound = true;
    this.idle = false;
    this.settleTarget = idx;
    this.settleStart = performance.now();
    this.settleDur = durMs;
  }

  getShape(): Shape {
    return this.current;
  }

  getStyle(): FaceStyle {
    return this.style;
  }

  /** Resolves when the style is active (3D/photo assets load once). */
  async setStyle(style: FaceStyle): Promise<void> {
    if (style === '3d') await this.ensureAvatar();
    if (style === 'photo') await this.ensurePhotos();
    this.style = style;
    saveFaceStyle(style);
    this.syncCanvases();
  }

  async toggleStyle(): Promise<FaceStyle> {
    const next = STYLE_ORDER[(STYLE_ORDER.indexOf(this.style) + 1) % STYLE_ORDER.length];
    await this.setStyle(next);
    return next;
  }

  private ensureAvatar(): Promise<Avatar3D> {
    if (this.avatar) return Promise.resolve(this.avatar);
    this.avatarLoading ??= import('./faces/avatar3d')
      .then((m) => m.Avatar3D.create(this.canvas.parentElement!))
      .then((avatar) => {
        this.avatar = avatar;
        this.syncCanvases();
        return avatar;
      })
      .catch((err) => {
        this.avatarLoading = null;
        throw err;
      });
    return this.avatarLoading;
  }

  private ensurePhotos(): Promise<void> {
    if (this.photos) return Promise.resolve();
    this.photosLoading ??= Promise.all(
      REAL_FACES.map((f) => {
        const img = new Image();
        img.src = `${import.meta.env.BASE_URL}faces/${f.img}`;
        return img.decode().then(() => img);
      }),
    )
      .then((imgs) => {
        this.photos = imgs;
        this.photoIdx = Math.floor(Math.random() * imgs.length);
        this.syncCanvases();
      })
      .catch((err) => {
        this.photosLoading = null;
        throw err;
      });
    return this.photosLoading;
  }

  private renderingPhotos(): boolean {
    return (this.photoRound || this.style === 'photo') && this.photos !== null;
  }

  private syncCanvases(): void {
    const is3d = this.style === '3d' && this.avatar !== null && !this.photoRound;
    this.canvas.classList.toggle('hidden', is3d);
    this.avatar?.canvas.classList.toggle('hidden', !is3d);
  }

  /** Where the current photo is drawn on the canvas (contain-fit square). */
  photoRect(): { x: number; y: number; size: number } {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const size = Math.min(w, h) * 0.86;
    // Slightly below center so the countdown digit clears the card.
    return { x: (w - size) / 2, y: (h - size) / 2 + h * 0.04, size };
  }

  private drawPhotos(ctx: CanvasRenderingContext2D, now: number): void {
    const photos = this.photos!;
    if (this.settleTarget >= 0) {
      // Slot-machine deceleration, guaranteed to land on the target.
      const t = Math.min(1, (now - this.settleStart) / this.settleDur);
      if (t >= 1) {
        this.photoIdx = this.settleTarget;
      } else if (now >= this.nextFlip) {
        const interval = 90 + t * t * 520;
        this.photoIdx = now + interval >= this.settleStart + this.settleDur
          ? this.settleTarget
          : (this.photoIdx + 1) % photos.length;
        this.nextFlip = now + interval;
      }
    } else if (this.idle && now >= this.nextFlip) {
      // Fast roulette while idling.
      this.photoIdx = (this.photoIdx + 1) % photos.length;
      this.nextFlip = now + 130;
    }

    const { x, y, size } = this.photoRect();
    const r = size * 0.06;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetY = size * 0.02;
    ctx.fillStyle = '#1d2330';
    ctx.fill();
    ctx.restore();
    ctx.clip();
    ctx.drawImage(photos[this.photoIdx], x, y, size, size);
    ctx.restore();
    ctx.lineWidth = Math.max(2, size * 0.012);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.stroke();
  }

  private loop(now: number): void {
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
    if (this.style === '3d' && this.avatar && !this.renderingPhotos()) {
      this.avatar.render(pose);
    } else {
      const { canvas, ctx } = this;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (this.renderingPhotos()) this.drawPhotos(ctx, now);
        else if (this.style === 'human') drawHumanFace(ctx, w, h, pose);
        else drawToonFace(ctx, w, h, pose);
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }
}
