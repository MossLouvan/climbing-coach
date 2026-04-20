import type { HoldType } from '@domain/models';

/**
 * First-pass heuristic hold-type classifier.
 *
 * The real answer needs a vision model run on a cropped image patch
 * around the tap location. That's a larger piece of work (on-device
 * model + frame extraction). For now we take the only signal the user
 * hands us: the radius they drew. Climbers tend to size their tap to
 * the hold, so radius is a surprisingly informative prior.
 *
 * Thresholds are in NORMALIZED image units (same units as the stored
 * hold radius), tuned against the app's default `0.04` starter radius
 * for a typical jug.
 */
export interface HoldTypeGuess {
  readonly type: HoldType;
  readonly confidence: number;
}

const THRESHOLDS: ReadonlyArray<{ readonly max: number; readonly guess: HoldTypeGuess }> = [
  { max: 0.022, guess: { type: 'crimp', confidence: 0.55 } },
  { max: 0.032, guess: { type: 'foot_chip', confidence: 0.5 } },
  { max: 0.045, guess: { type: 'pocket', confidence: 0.45 } },
  { max: 0.06, guess: { type: 'pinch', confidence: 0.45 } },
  { max: 0.085, guess: { type: 'jug', confidence: 0.55 } },
  { max: 0.12, guess: { type: 'sloper', confidence: 0.5 } },
  { max: Number.POSITIVE_INFINITY, guess: { type: 'volume', confidence: 0.55 } },
];

export function classifyHoldByRadius(radius: number): HoldTypeGuess {
  for (const t of THRESHOLDS) {
    if (radius <= t.max) return t.guess;
  }
  return { type: 'unknown', confidence: 0.2 };
}
