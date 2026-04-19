import type { Hold, HoldId, NormalizedPoint2D } from '@domain/models';

import type { LimbContact } from './contact';

/**
 * For climbing-specific balance analysis, "support" is primarily the
 * feet that are weighted. We approximate the support polygon as the
 * convex shape spanning the positions of feet in contact (with a
 * small pull toward hands in contact — hands can share load, though
 * less than in standing balance).
 *
 * We return the support polygon as the midpoint of contributing
 * support holds (weighted 1.0 for feet, 0.35 for hands) along with
 * its horizontal extent (xMin, xMax) — useful for checking whether
 * the CoM x-projection lies within the support column, a common
 * climbing cue: "get under the hold".
 */
export interface SupportRegion {
  readonly center: NormalizedPoint2D;
  readonly xMin: number;
  readonly xMax: number;
  readonly holdIds: ReadonlyArray<HoldId>;
  readonly weight: number; // sum of contributing weights; 0 when no support
}

export function supportRegion(
  contacts: ReadonlyArray<LimbContact>,
  holds: ReadonlyArray<Hold>,
): SupportRegion {
  const byId = new Map(holds.map((h) => [h.id, h]));
  let xSum = 0;
  let ySum = 0;
  let weight = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  const ids: HoldId[] = [];

  for (const c of contacts) {
    const hold = byId.get(c.holdId);
    if (!hold) continue;
    const w = c.limb === 'left_foot' || c.limb === 'right_foot' ? 1.0 : 0.35;
    xSum += hold.position.x * w;
    ySum += hold.position.y * w;
    weight += w;
    if (hold.position.x < xMin) xMin = hold.position.x;
    if (hold.position.x > xMax) xMax = hold.position.x;
    ids.push(hold.id);
  }

  if (weight === 0) {
    return {
      center: { x: 0.5, y: 1 },
      xMin: 0.5,
      xMax: 0.5,
      holdIds: [],
      weight: 0,
    };
  }
  return {
    center: { x: xSum / weight, y: ySum / weight },
    xMin,
    xMax,
    holdIds: ids,
    weight,
  };
}
