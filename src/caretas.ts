import type { Shape } from './blendshapes';
import { LR } from './blendshapes';

export interface Careta {
  name: string;
  shape: Shape;
}

const merge = (...parts: Shape[]): Shape => Object.assign({}, ...parts);

/**
 * 20 hand-authored caretas. Rules of thumb:
 * - every pose is physically doable by an average human,
 * - each pose has 2-4 dominant channels so scoring reads clearly,
 * - values are targets, scoring is forgiving around them.
 */
export const CARETAS: Careta[] = [
  {
    name: 'The Kiss',
    shape: merge({ mouthPucker: 0.95, jawOpen: 0.1 }, LR('browInnerUp', 0.4), LR('eyeWide', 0.3)),
  },
  {
    name: 'Jaw Drop',
    shape: merge({ jawOpen: 0.95, browInnerUp: 0.8 }, LR('eyeWide', 0.9), LR('browOuterUp', 0.7)),
  },
  {
    name: 'Grumpy Boss',
    shape: merge(LR('browDown', 0.9), LR('mouthFrown', 0.8), LR('eyeSquint', 0.5), { mouthShrugLower: 0.4 }),
  },
  {
    name: 'Cheek Balloon',
    shape: merge({ cheekPuff: 1.0, mouthClose: 0.6 }, LR('eyeWide', 0.4)),
  },
  {
    name: 'Mega Grin',
    shape: merge(LR('mouthSmile', 1.0), LR('cheekSquint', 0.7), LR('eyeSquint', 0.6), { jawOpen: 0.35 }),
  },
  {
    name: 'One-Eyed Pirate',
    shape: merge(
      { eyeBlinkLeft: 1.0, eyeWideRight: 0.8, browDownLeft: 0.7, browOuterUpRight: 0.8 },
      LR('mouthStretch', 0.4), { jawOpen: 0.25 },
    ),
  },
  {
    name: 'Sourpuss',
    shape: merge({ mouthPucker: 0.7 }, LR('eyeSquint', 0.9), LR('browDown', 0.6), LR('noseSneer', 0.6)),
  },
  {
    name: 'The Scream',
    shape: merge({ jawOpen: 1.0 }, LR('mouthStretch', 0.7), LR('eyeWide', 1.0), LR('browOuterUp', 0.9), { browInnerUp: 0.9 }),
  },
  {
    name: 'Smug Sideways',
    shape: merge({ mouthLeft: 0.9, jawLeft: 0.6, mouthSmileLeft: 0.6 }, LR('eyeSquint', 0.3), { browOuterUpRight: 0.6 }),
  },
  {
    name: 'Fish Face',
    shape: merge({ mouthFunnel: 0.9, jawOpen: 0.45 }, LR('cheekSquint', 0.3), LR('eyeWide', 0.5)),
  },
  {
    name: 'Stink Detector',
    shape: merge(LR('noseSneer', 1.0), LR('mouthUpperUp', 0.7), LR('browDown', 0.5), LR('eyeSquint', 0.6)),
  },
  {
    name: 'Pouty Toddler',
    shape: merge({ mouthShrugLower: 0.9, mouthShrugUpper: 0.5, browInnerUp: 0.9 }, LR('mouthFrown', 0.7)),
  },
  {
    name: 'Lemon Bite',
    shape: merge(LR('eyeBlink', 0.9), { mouthPucker: 0.9 }, LR('noseSneer', 0.5), LR('browDown', 0.4)),
  },
  {
    name: 'Evil Plan',
    shape: merge(LR('browDown', 0.8), LR('mouthSmile', 0.9), LR('eyeSquint', 0.7), { jawOpen: 0.15 }),
  },
  {
    name: 'Wide-Eyed Owl',
    shape: merge(LR('eyeWide', 1.0), LR('browOuterUp', 0.9), { browInnerUp: 0.7, mouthClose: 0.5, mouthPucker: 0.3 }),
  },
  {
    name: 'Sideways Slurp',
    shape: merge({ mouthRight: 0.9, jawRight: 0.6, mouthPucker: 0.5 }, { eyeBlinkRight: 0.8, browOuterUpLeft: 0.7 }),
  },
  {
    name: 'Big Chomp',
    shape: merge({ jawOpen: 0.8 }, LR('mouthUpperUp', 0.8), LR('mouthLowerDown', 0.8), LR('noseSneer', 0.4), LR('eyeSquint', 0.5)),
  },
  {
    name: 'Kissy Wink',
    shape: merge({ mouthPucker: 0.9, eyeBlinkRight: 1.0, browOuterUpLeft: 0.7, eyeWideLeft: 0.5, mouthLeft: 0.4 }),
  },
  {
    name: 'Flat Tire',
    shape: merge(LR('mouthPress', 0.9), { mouthClose: 0.7 }, LR('browDown', 0.6), LR('eyeSquint', 0.4)),
  },
  {
    name: 'Total Panic',
    shape: merge(
      { jawOpen: 0.7, browInnerUp: 1.0 }, LR('mouthStretch', 0.9), LR('browOuterUp', 0.6),
      LR('eyeWide', 0.8), LR('mouthFrown', 0.5),
    ),
  },
];

export function randomCareta(exclude?: Careta): Careta {
  let pick: Careta;
  do {
    pick = CARETAS[Math.floor(Math.random() * CARETAS.length)];
  } while (CARETAS.length > 1 && pick === exclude);
  return pick;
}
