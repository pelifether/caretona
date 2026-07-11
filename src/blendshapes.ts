/**
 * Expressions are represented as sparse ARKit-style blendshape vectors —
 * the exact same representation MediaPipe Face Landmarker outputs for the
 * player's face, so reference and player live in one comparable space.
 * All values are 0..1.
 */
export type Shape = Record<string, number>;

/** Channels used for scoring (gaze is excluded on purpose: too noisy while grimacing). */
export const SCORED_CHANNELS = [
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight',
  'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel', 'mouthLeft',
  'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthPucker', 'mouthRight', 'mouthRollLower', 'mouthRollUpper',
  'mouthShrugLower', 'mouthShrugUpper', 'mouthSmileLeft', 'mouthSmileRight',
  'mouthStretchLeft', 'mouthStretchRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
  'noseSneerLeft', 'noseSneerRight',
] as const;

const MIRROR_MAP: Record<string, string> = {};
for (const ch of SCORED_CHANNELS) {
  if (ch.endsWith('Left')) MIRROR_MAP[ch] = ch.slice(0, -4) + 'Right';
  else if (ch.endsWith('Right')) MIRROR_MAP[ch] = ch.slice(0, -5) + 'Left';
}

export function get(s: Shape, key: string): number {
  return s[key] ?? 0;
}

/** Average of left+right variants of a channel, e.g. sym(s, 'eyeBlink'). */
export function sym(s: Shape, base: string): number {
  return (get(s, base + 'Left') + get(s, base + 'Right')) / 2;
}

export function mirrorShape(s: Shape): Shape {
  const out: Shape = {};
  for (const [k, v] of Object.entries(s)) out[MIRROR_MAP[k] ?? k] = v;
  return out;
}

export function lerpShape(a: Shape, b: Shape, t: number): Shape {
  const out: Shape = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) out[k] = get(a, k) + (get(b, k) - get(a, k)) * t;
  return out;
}

/** Helper to author symmetric presets tersely: LR('eyeBlink', 1) → both sides. */
export function LR(base: string, v: number): Shape {
  return { [base + 'Left']: v, [base + 'Right']: v };
}
