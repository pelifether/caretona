import type { Shape } from '../blendshapes';
import { get, sym } from '../blendshapes';
import type { FacePose } from '../referenceFace';

/**
 * "2.5D" human face: same procedural blendshape pipeline as the toon face,
 * but with skin shading, eyelids, irises, a real nose, two-lip mouth and hair.
 * Still plain canvas 2D — one pass per frame, no extra runtime cost.
 */

const SKIN = '#EDBB93';
const SKIN_LIGHT = '#F7D3AE';
const SKIN_SHADE = '#D49B6F';
const LINE = 'rgba(122,74,44,0.85)';
const HAIR = '#3B2A1E';
const BROW = '#4A3526';
const IRIS = '#6B4A2F';
const LIP_UP = '#B4645A';
const LIP_LO = '#C97B6D';
const MOUTH_DARK = '#4A1F1C';

export function drawHumanFace(ctx: CanvasRenderingContext2D, w: number, h: number, pose: FacePose): void {
  const s = pose.shape;
  const R = Math.min(w, h) * 0.30;
  const cx = w / 2;
  const cy = h / 2;

  const jawOpen = get(s, 'jawOpen');
  const jawShift = (get(s, 'jawRight') - get(s, 'jawLeft')) * 0.12 * R;
  const cheekPuff = get(s, 'cheekPuff');
  const chinDrop = jawOpen * R * 0.26;
  const cheekW = 1 + cheekPuff * 0.14;

  ctx.save();
  ctx.translate(cx, cy);

  // ---- Ears (behind head)
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * R * 0.82, -R * 0.02, R * 0.11, R * 0.19, side * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = SKIN_SHADE;
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = R * 0.018;
    ctx.stroke();
  }

  // ---- Head: skull + tapered jaw and chin
  const head = new Path2D();
  head.moveTo(0, -R * 1.06);
  head.bezierCurveTo(R * 0.62, -R * 1.06, R * 0.82, -R * 0.62, R * 0.80 * cheekW, -R * 0.10);
  head.bezierCurveTo(R * 0.80 * cheekW, R * 0.32, R * 0.62, R * (0.62 + jawOpen * 0.10) + chinDrop * 0.4 + jawShift * 0.3, R * 0.30 + jawShift, R * 0.90 + chinDrop * 0.8);
  head.quadraticCurveTo(jawShift, R * 1.02 + chinDrop, -R * 0.30 + jawShift, R * 0.90 + chinDrop * 0.8);
  head.bezierCurveTo(-R * 0.62, R * (0.62 + jawOpen * 0.10) + chinDrop * 0.4 + jawShift * 0.3, -R * 0.80 * cheekW, R * 0.32, -R * 0.80 * cheekW, -R * 0.10);
  head.bezierCurveTo(-R * 0.82, -R * 0.62, -R * 0.62, -R * 1.06, 0, -R * 1.06);
  head.closePath();

  const skin = ctx.createRadialGradient(-R * 0.22, -R * 0.30, R * 0.15, 0, R * 0.05, R * 1.55);
  skin.addColorStop(0, SKIN_LIGHT);
  skin.addColorStop(0.55, SKIN);
  skin.addColorStop(1, SKIN_SHADE);
  ctx.fillStyle = skin;
  ctx.fill(head);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = R * 0.022;
  ctx.stroke(head);

  // Side shading for depth (clipped to head)
  ctx.save();
  ctx.clip(head);
  for (const side of [-1, 1]) {
    const sh = ctx.createLinearGradient(side * R * 0.45, 0, side * R * 0.82, 0);
    sh.addColorStop(0, 'rgba(183,126,85,0)');
    sh.addColorStop(1, 'rgba(183,126,85,0.35)');
    ctx.fillStyle = sh;
    ctx.fillRect(side < 0 ? -R : 0, -R * 1.1, R, R * 2.3);
  }
  // Chin/jaw shadow
  ctx.fillStyle = 'rgba(183,126,85,0.18)';
  ctx.beginPath();
  ctx.ellipse(jawShift, R * 0.92 + chinDrop, R * 0.30, R * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cheek-puff shine
  if (cheekPuff > 0.05) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * R * 0.52 * cheekW, R * 0.28, R * 0.20, R * 0.24, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(247,211,174,${0.5 * cheekPuff})`;
      ctx.fill();
    }
  }

  // Blush
  const smileAmt = sym(s, 'mouthSmile');
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * R * 0.46, R * 0.24, R * 0.16, R * 0.10, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(214,106,89,${0.10 + smileAmt * 0.10 + cheekPuff * 0.15})`;
    ctx.fill();
  }
  ctx.restore();

  // ---- Hair: simple side-parted cap
  ctx.save();
  const hair = new Path2D();
  hair.moveTo(-R * 0.80, -R * 0.30);
  hair.bezierCurveTo(-R * 0.92, -R * 0.95, -R * 0.45, -R * 1.18, 0, -R * 1.16);
  hair.bezierCurveTo(R * 0.50, -R * 1.18, R * 0.90, -R * 0.90, R * 0.80, -R * 0.28);
  hair.quadraticCurveTo(R * 0.72, -R * 0.52, R * 0.55, -R * 0.62);
  hair.bezierCurveTo(R * 0.30, -R * 0.74, -R * 0.05, -R * 0.86, -R * 0.28, -R * 0.68);
  hair.quadraticCurveTo(-R * 0.60, -R * 0.44, -R * 0.80, -R * 0.30);
  hair.closePath();
  const hg = ctx.createLinearGradient(0, -R * 1.2, 0, -R * 0.3);
  hg.addColorStop(0, '#4E3A2A');
  hg.addColorStop(1, HAIR);
  ctx.fillStyle = hg;
  ctx.fill(hair);
  ctx.restore();

  // ---- Eyes
  const browInnerUp = get(s, 'browInnerUp');
  for (const side of [-1, 1] as const) {
    const L = side < 0;
    const blink = get(s, L ? 'eyeBlinkLeft' : 'eyeBlinkRight');
    const wide = get(s, L ? 'eyeWideLeft' : 'eyeWideRight');
    const squint = get(s, L ? 'eyeSquintLeft' : 'eyeSquintRight');
    const cheekSq = get(s, L ? 'cheekSquintLeft' : 'cheekSquintRight');

    const ex = side * R * 0.34;
    const ey = -R * 0.16;
    const ew = R * 0.21;
    const openT = Math.max(0, (1 - blink) * (1 + wide * 0.55));
    const openB = Math.max(0, (1 - blink) * (1 - Math.max(squint, cheekSq * 0.6) * 0.6));
    const hT = R * 0.135 * openT;
    const hB = R * 0.095 * openB;

    // Eye socket shading
    ctx.beginPath();
    ctx.ellipse(ex, ey, ew * 1.25, R * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(183,126,85,0.09)';
    ctx.fill();

    if (blink > 0.88 || hT < R * 0.015) {
      // Closed: lash line
      ctx.beginPath();
      ctx.moveTo(ex - ew, ey + R * 0.01);
      ctx.quadraticCurveTo(ex, ey + R * 0.05, ex + ew, ey + R * 0.01);
      ctx.strokeStyle = '#5A3A28';
      ctx.lineWidth = R * 0.035;
      ctx.lineCap = 'round';
      ctx.stroke();
      continue;
    }

    // Eyeball (almond)
    const eye = new Path2D();
    eye.moveTo(ex - ew, ey + R * 0.01);
    eye.quadraticCurveTo(ex, ey - hT, ex + ew, ey);
    eye.quadraticCurveTo(ex, ey + hB, ex - ew, ey + R * 0.01);
    eye.closePath();
    ctx.fillStyle = '#FBF7F0';
    ctx.fill(eye);

    // Iris + pupil, clipped by lids
    ctx.save();
    ctx.clip(eye);
    const ir = R * 0.078 * (1 + wide * 0.08);
    const px = ex + pose.gazeX * ew * 0.35;
    const py = ey + pose.gazeY * hT * 0.5;
    const ig = ctx.createRadialGradient(px, py, ir * 0.2, px, py, ir);
    ig.addColorStop(0, '#8A6238');
    ig.addColorStop(1, IRIS);
    ctx.beginPath();
    ctx.arc(px, py, ir, 0, Math.PI * 2);
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, ir * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#1D120B';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - ir * 0.3, py - ir * 0.35, ir * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    // Upper lid shadow on eyeball
    ctx.beginPath();
    ctx.moveTo(ex - ew, ey + R * 0.01);
    ctx.quadraticCurveTo(ex, ey - hT, ex + ew, ey);
    ctx.strokeStyle = 'rgba(122,74,44,0.30)';
    ctx.lineWidth = R * 0.04;
    ctx.stroke();
    ctx.restore();

    // Lash lines
    ctx.beginPath();
    ctx.moveTo(ex - ew, ey + R * 0.01);
    ctx.quadraticCurveTo(ex, ey - hT, ex + ew, ey);
    ctx.strokeStyle = '#5A3A28';
    ctx.lineWidth = R * 0.030;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex - ew * 0.9, ey + R * 0.02);
    ctx.quadraticCurveTo(ex, ey + hB, ex + ew * 0.95, ey + R * 0.01);
    ctx.strokeStyle = 'rgba(90,58,40,0.45)';
    ctx.lineWidth = R * 0.016;
    ctx.stroke();

    // Lid crease
    ctx.beginPath();
    ctx.moveTo(ex - ew * 0.8, ey - hT - R * 0.035);
    ctx.quadraticCurveTo(ex, ey - hT - R * 0.075 - wide * R * 0.03, ex + ew * 0.8, ey - hT - R * 0.03);
    ctx.strokeStyle = 'rgba(122,74,44,0.35)';
    ctx.lineWidth = R * 0.016;
    ctx.stroke();

    // Squint: cheek line pushing up under the eye
    if (Math.max(squint, cheekSq) > 0.3) {
      ctx.beginPath();
      ctx.moveTo(ex - ew * 0.7, ey + R * 0.12);
      ctx.quadraticCurveTo(ex, ey + R * 0.08, ex + ew * 0.7, ey + R * 0.12);
      ctx.strokeStyle = `rgba(122,74,44,${Math.max(squint, cheekSq) * 0.4})`;
      ctx.lineWidth = R * 0.018;
      ctx.stroke();
    }
  }

  // ---- Brows: tapered strokes
  for (const side of [-1, 1] as const) {
    const L = side < 0;
    const down = get(s, L ? 'browDownLeft' : 'browDownRight');
    const outerUp = get(s, L ? 'browOuterUpLeft' : 'browOuterUpRight');
    const bx = side * R * 0.36;
    const by = -R * 0.40;
    const innerY = by - browInnerUp * R * 0.13 + down * R * 0.12;
    const outerY = by - outerUp * R * 0.14 + down * R * 0.06;
    const midY = Math.min(innerY, outerY) - R * 0.045;

    ctx.beginPath();
    ctx.moveTo(bx - side * R * 0.19, innerY);
    ctx.quadraticCurveTo(bx, midY, bx + side * R * 0.24, outerY);
    ctx.strokeStyle = BROW;
    ctx.lineWidth = R * 0.055;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - side * R * 0.16, innerY + R * 0.015);
    ctx.quadraticCurveTo(bx + side * R * 0.05, midY + R * 0.02, bx + side * R * 0.23, outerY + R * 0.01);
    ctx.strokeStyle = 'rgba(74,53,38,0.6)';
    ctx.lineWidth = R * 0.028;
    ctx.stroke();

    // Frown wrinkle between brows
    if (down > 0.4) {
      ctx.beginPath();
      ctx.moveTo(side * R * 0.06, by + R * 0.02);
      ctx.lineTo(side * R * 0.045, by + R * 0.14);
      ctx.strokeStyle = `rgba(122,74,44,${(down - 0.4) * 0.8})`;
      ctx.lineWidth = R * 0.016;
      ctx.stroke();
    }
  }

  // Forehead wrinkles when brows shoot up
  const browUp = Math.max(browInnerUp, sym(s, 'browOuterUp'));
  if (browUp > 0.45) {
    ctx.strokeStyle = `rgba(122,74,44,${(browUp - 0.45) * 0.55})`;
    ctx.lineWidth = R * 0.016;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.34, -R * (0.62 + i * 0.09));
      ctx.quadraticCurveTo(0, -R * (0.70 + i * 0.09), R * 0.34, -R * (0.62 + i * 0.09));
      ctx.stroke();
    }
  }

  // ---- Nose
  const sneer = sym(s, 'noseSneer');
  const noseY = R * 0.16 - sneer * R * 0.05;
  // Bridge shadow
  ctx.beginPath();
  ctx.moveTo(-R * 0.045, -R * 0.20);
  ctx.quadraticCurveTo(-R * 0.075, noseY - R * 0.10, -R * 0.10, noseY + R * 0.02);
  ctx.strokeStyle = 'rgba(122,74,44,0.22)';
  ctx.lineWidth = R * 0.030;
  ctx.lineCap = 'round';
  ctx.stroke();
  // Tip + alar wings
  ctx.beginPath();
  ctx.ellipse(0, noseY + R * 0.035, R * 0.085, R * 0.065, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(212,155,111,0.55)';
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * R * 0.105, noseY + R * 0.045, R * 0.05, side < 0 ? Math.PI * 0.5 : Math.PI * 0.9, side < 0 ? Math.PI * 1.5 : Math.PI * 2.1);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = R * 0.020;
    ctx.stroke();
    // Nostril
    ctx.beginPath();
    ctx.ellipse(side * R * 0.062, noseY + R * (0.075 - sneer * 0.02), R * 0.028, R * (0.018 + sneer * 0.012), side * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74,31,28,0.75)';
    ctx.fill();
  }
  // Tip highlight
  ctx.beginPath();
  ctx.ellipse(-R * 0.02, noseY - R * 0.005, R * 0.035, R * 0.025, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(247,211,174,0.8)';
  ctx.fill();
  // Sneer wrinkles
  if (sneer > 0.2) {
    ctx.strokeStyle = `rgba(122,74,44,${sneer * 0.5})`;
    ctx.lineWidth = R * 0.016;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * R * 0.13, noseY - R * 0.04);
      ctx.quadraticCurveTo(side * R * 0.19, noseY - R * 0.14, side * R * 0.14, noseY - R * 0.22);
      ctx.stroke();
    }
  }

  drawHumanMouth(ctx, s, R, jawShift);

  ctx.restore();
}

function drawHumanMouth(ctx: CanvasRenderingContext2D, s: Shape, R: number, jawShift: number): void {
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
  const shiftX = (get(s, 'mouthRight') - get(s, 'mouthLeft')) * R * 0.20 + jawShift * 0.8;

  const my = R * 0.52 + jawOpen * R * 0.15 - shrugLower * R * 0.06;
  const round = Math.max(pucker, funnel * 0.8);
  const halfW = R * 0.30 * (1 + stretch * 0.42 + smile * 0.22) * (1 - round * 0.60);

  let gap = jawOpen * R * 0.40 + funnel * R * 0.17 + (upperUp + lowerDown) * R * 0.11;
  gap *= (1 - close * 0.85);
  gap *= (1 - press * 0.9);
  if (pucker > 0.5 && funnel < 0.3) gap = Math.min(gap, R * 0.09);

  const cornerY = (-smile * 0.24 + frown * 0.20 + stretch * 0.04) * R;
  const lipThick = R * (0.055 + round * 0.03);
  const upperY = my - gap / 2 - upperUp * R * 0.05;
  const lowerY = my + gap / 2 + lowerDown * R * 0.05 - shrugLower * R * 0.09;

  ctx.save();
  ctx.translate(shiftX, 0);
  ctx.lineJoin = 'round';

  // Nasolabial folds on smile
  if (smile > 0.35) {
    ctx.strokeStyle = `rgba(122,74,44,${(smile - 0.35) * 0.5})`;
    ctx.lineWidth = R * 0.018;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * R * 0.13, R * 0.24);
      ctx.quadraticCurveTo(side * (halfW + R * 0.12), my - R * 0.10, side * (halfW + R * 0.04), my + cornerY);
      ctx.stroke();
    }
  }

  if (gap < R * 0.04) {
    // ----- Closed: two lips meeting at an expressive line
    const midLift = -cornerY * 1.1 + (shrugLower + press * 0.4) * -R * 0.05;
    // Upper lip (with cupid's bow)
    ctx.beginPath();
    ctx.moveTo(-halfW, my + cornerY);
    ctx.quadraticCurveTo(-halfW * 0.35, my + midLift - lipThick, -halfW * 0.12, my + midLift - lipThick * 0.8);
    ctx.quadraticCurveTo(0, my + midLift - lipThick * 0.55, halfW * 0.12, my + midLift - lipThick * 0.8);
    ctx.quadraticCurveTo(halfW * 0.35, my + midLift - lipThick, halfW, my + cornerY);
    ctx.quadraticCurveTo(0, my + midLift, -halfW, my + cornerY);
    ctx.closePath();
    ctx.fillStyle = LIP_UP;
    ctx.fill();
    // Lower lip
    ctx.beginPath();
    ctx.moveTo(-halfW, my + cornerY);
    ctx.quadraticCurveTo(0, my + midLift, halfW, my + cornerY);
    ctx.quadraticCurveTo(0, my + midLift + lipThick * (1.5 - press * 0.8), -halfW, my + cornerY);
    ctx.closePath();
    ctx.fillStyle = LIP_LO;
    ctx.fill();
    // Lip seam
    ctx.beginPath();
    ctx.moveTo(-halfW, my + cornerY);
    ctx.quadraticCurveTo(0, my + midLift, halfW, my + cornerY);
    ctx.strokeStyle = MOUTH_DARK;
    ctx.lineWidth = R * 0.020;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Lower lip highlight
    ctx.beginPath();
    ctx.ellipse(0, my + midLift + lipThick * 0.75, halfW * 0.4, lipThick * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(247,211,174,0.35)';
    ctx.fill();
  } else {
    // ----- Open mouth: dark interior framed by lips
    const interior = new Path2D();
    interior.moveTo(-halfW, my + cornerY);
    interior.quadraticCurveTo(0, upperY - R * 0.03, halfW, my + cornerY);
    interior.quadraticCurveTo(0, lowerY + R * 0.09, -halfW, my + cornerY);
    interior.closePath();
    ctx.fillStyle = MOUTH_DARK;
    ctx.fill(interior);

    // Teeth
    ctx.save();
    ctx.clip(interior);
    const teeth = Math.max(upperUp, jawOpen * 0.55, smile * 0.4) * (1 - round);
    if (teeth > 0.12) {
      ctx.fillStyle = '#F6F1E7';
      ctx.fillRect(-halfW, upperY - R * 0.02, halfW * 2, R * (0.05 + teeth * 0.09));
      ctx.strokeStyle = 'rgba(160,140,120,0.4)';
      ctx.lineWidth = R * 0.008;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * halfW * 0.3, upperY - R * 0.02);
        ctx.lineTo(i * halfW * 0.3, upperY + R * (0.03 + teeth * 0.09));
        ctx.stroke();
      }
    }
    if (lowerDown > 0.25 && round < 0.4) {
      ctx.fillStyle = '#EDE6D8';
      ctx.fillRect(-halfW, lowerY - R * (0.04 + lowerDown * 0.05), halfW * 2, R * 0.11);
    }
    // Tongue hint on big jaw open
    if (jawOpen > 0.55 && round < 0.5) {
      ctx.beginPath();
      ctx.ellipse(0, lowerY + R * 0.02, halfW * 0.55, R * 0.07, 0, Math.PI, Math.PI * 2);
      ctx.fillStyle = '#A34A44';
      ctx.fill();
    }
    ctx.restore();

    // Upper lip band
    ctx.beginPath();
    ctx.moveTo(-halfW - R * 0.01, my + cornerY);
    ctx.quadraticCurveTo(0, upperY - R * 0.03 - lipThick, halfW + R * 0.01, my + cornerY);
    ctx.quadraticCurveTo(0, upperY - R * 0.03, -halfW - R * 0.01, my + cornerY);
    ctx.closePath();
    ctx.fillStyle = LIP_UP;
    ctx.fill();
    // Lower lip band
    ctx.beginPath();
    ctx.moveTo(-halfW - R * 0.01, my + cornerY);
    ctx.quadraticCurveTo(0, lowerY + R * 0.09, halfW + R * 0.01, my + cornerY);
    ctx.quadraticCurveTo(0, lowerY + R * 0.09 + lipThick * 1.4, -halfW - R * 0.01, my + cornerY);
    ctx.closePath();
    ctx.fillStyle = LIP_LO;
    ctx.fill();
  }

  // Pucker/funnel creases
  if (round > 0.45) {
    ctx.strokeStyle = `rgba(122,74,44,${(round - 0.45) * 1.0})`;
    ctx.lineWidth = R * 0.016;
    ctx.lineCap = 'round';
    const n = 8;
    const rr = Math.max(halfW, gap / 2) + R * 0.07;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, my + Math.sin(a) * (gap / 2 + R * 0.07));
      ctx.lineTo(Math.cos(a) * (rr + R * 0.05), my + Math.sin(a) * (gap / 2 + R * 0.12));
      ctx.stroke();
    }
  }

  // Chin pout crease
  if (shrugLower > 0.3) {
    ctx.beginPath();
    ctx.moveTo(-halfW * 0.6, my + R * 0.16);
    ctx.quadraticCurveTo(0, my + R * 0.23, halfW * 0.6, my + R * 0.16);
    ctx.strokeStyle = `rgba(122,74,44,${shrugLower * 0.5})`;
    ctx.lineWidth = R * 0.018;
    ctx.stroke();
  }

  ctx.restore();
}
