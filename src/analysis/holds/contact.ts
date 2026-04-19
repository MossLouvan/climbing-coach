import {
  JOINT_INDEX,
  type Hold,
  type HoldId,
  type Keypoint2D,
  type Pose2D,
} from '@domain/models';

/**
 * Determines which tagged holds each limb (hand/foot) is in contact
 * with on a given frame. "Contact" here is a soft geometric test —
 * we have no force sensors, so a hand is considered IN CONTACT with
 * a hold when:
 *
 *   - the wrist keypoint is inside `hold.radius * contactSlack`
 *   - the wrist confidence is above `minConfidence`
 *
 * The same applies to ankles for foot holds.
 */
export interface ContactOptions {
  readonly contactSlack: number; // default 1.4 — account for hand size
  readonly minConfidence: number; // default 0.35
}

const DEFAULTS: ContactOptions = { contactSlack: 1.4, minConfidence: 0.35 };

export type Limb = 'left_hand' | 'right_hand' | 'left_foot' | 'right_foot';

const LIMB_JOINT: Readonly<Record<Limb, number>> = {
  left_hand: JOINT_INDEX.left_wrist,
  right_hand: JOINT_INDEX.right_wrist,
  left_foot: JOINT_INDEX.left_ankle,
  right_foot: JOINT_INDEX.right_ankle,
};

export interface LimbContact {
  readonly limb: Limb;
  readonly holdId: HoldId;
  readonly distanceNorm: number;
}

export function detectContacts(
  pose: Pose2D,
  holds: ReadonlyArray<Hold>,
  optsIn: Partial<ContactOptions> = {},
): LimbContact[] {
  const opts = { ...DEFAULTS, ...optsIn };
  const out: LimbContact[] = [];
  const limbs: Limb[] = ['left_hand', 'right_hand', 'left_foot', 'right_foot'];
  for (const limb of limbs) {
    const kp = pose.keypoints[LIMB_JOINT[limb]];
    if (!kp || kp.confidence < opts.minConfidence) continue;
    const best = closestHold(kp, holds, limb);
    if (!best) continue;
    const reach = best.hold.radius * opts.contactSlack;
    if (best.distance <= reach) {
      out.push({ limb, holdId: best.hold.id, distanceNorm: best.distance });
    }
  }
  return out;
}

function closestHold(
  kp: Keypoint2D,
  holds: ReadonlyArray<Hold>,
  limb: Limb,
): { hold: Hold; distance: number } | null {
  let bestHold: Hold | null = null;
  let bestDist = Infinity;
  for (const h of holds) {
    // Respect intendedLimb if set (foot-only holds can't be hand holds).
    if (h.intendedLimb) {
      if (isFootLimb(limb) && h.intendedLimb !== 'left_foot' && h.intendedLimb !== 'right_foot' && h.intendedLimb !== 'either') {
        continue;
      }
      if (!isFootLimb(limb) && h.intendedLimb !== 'left_hand' && h.intendedLimb !== 'right_hand' && h.intendedLimb !== 'either') {
        continue;
      }
    }
    const dx = kp.x - h.position.x;
    const dy = kp.y - h.position.y;
    const d = Math.hypot(dx, dy);
    if (d < bestDist) {
      bestDist = d;
      bestHold = h;
    }
  }
  return bestHold ? { hold: bestHold, distance: bestDist } : null;
}

function isFootLimb(limb: Limb): boolean {
  return limb === 'left_foot' || limb === 'right_foot';
}
