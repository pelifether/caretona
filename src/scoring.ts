import type { Shape } from './blendshapes';
import { SCORED_CHANNELS, get, mirrorShape } from './blendshapes';

/**
 * Scores in blendshape space rather than raw landmark geometry: it is
 * invariant to face proportions, head pose and camera distance, and measures
 * the thing players actually care about — "am I making the expression?".
 *
 * - Channels that define the careta (high target) dominate the score.
 * - Missing an activation hurts more than overshooting it.
 * - Doing unrelated things with your face costs a little.
 * - The player sees a mirrored reference, so we score the mirrored
 *   interpretation too and keep the better one.
 */

const INACTIVE_BASE_WEIGHT = 0.04;
const OVERSHOOT_FACTOR = 0.45;
const INACTIVE_SLACK = 0.12;
const CURVE = 1.7;

function rawError(player: Shape, target: Shape): number {
  let errSum = 0;
  let weightSum = 0;
  for (const ch of SCORED_CHANNELS) {
    const t = get(target, ch);
    const p = get(player, ch);
    const w = INACTIVE_BASE_WEIGHT + t;
    let err: number;
    if (t >= 0.1) {
      err = p < t ? (t - p) / Math.max(t, 0.001) : OVERSHOOT_FACTOR * (p - t);
    } else {
      err = Math.max(0, p - t - INACTIVE_SLACK);
    }
    errSum += w * Math.min(1, err);
    weightSum += w;
  }
  return errSum / weightSum;
}

/** 0..100. Perfect mimic → 100, neutral face → ~15, no face → caller returns 0. */
export function computeScore(player: Shape, target: Shape): number {
  const err = Math.min(rawError(player, target), rawError(mirrorShape(player), target));
  return Math.round(100 * Math.pow(Math.max(0, 1 - err), CURVE));
}

export interface ScoreTag {
  label: string;
  color: string;
}

/** Verdict displayed above the final number. */
export function scoreTag(score: number): ScoreTag {
  if (score <= 0) return { label: 'No face found :(', color: '#9aa3b5' };
  if (score < 10) return { label: 'Too far!', color: '#ff5252' };
  if (score < 25) return { label: 'Was that a sneeze?', color: '#ff7043' };
  if (score < 40) return { label: 'Warming up', color: '#ffb300' };
  if (score < 55) return { label: 'Getting there!', color: '#ffe082' };
  if (score < 70) return { label: 'Solid careta', color: '#aed581' };
  if (score < 80) return { label: 'Impressive!', color: '#69f0ae' };
  if (score < 90) return { label: 'Oscar-worthy', color: '#40c4ff' };
  if (score < 100) return { label: 'Careta master', color: '#b388ff' };
  return { label: 'Top 1%!', color: '#ffd700' };
}

/** Robust average of the sampled frames (element-wise median would be overkill). */
export function averageShapes(samples: Shape[]): Shape {
  const out: Shape = {};
  if (samples.length === 0) return out;
  for (const s of samples) {
    for (const [k, v] of Object.entries(s)) out[k] = (out[k] ?? 0) + v;
  }
  for (const k of Object.keys(out)) out[k] /= samples.length;
  return out;
}
