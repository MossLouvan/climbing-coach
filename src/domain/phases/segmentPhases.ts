import { detectContacts, type LimbContact } from '@analysis/holds/contact';
import { centerOfMass2D } from '@analysis/kinematics/centerOfMass';
import {
  type Hold,
  type HoldId,
  JOINT_INDEX,
  type MovementPhase,
  type PhaseKind,
  type Pose2D,
} from '@domain/models';

/**
 * Segment a pose track into climbing-specific movement phases.
 *
 * The detector is a small rule-based state machine rather than an
 * ML classifier — this keeps the reasoning auditable and avoids the
 * labeled-data problem. Signals used:
 *
 *   - number of limbs in contact with tagged holds
 *   - whether contacts changed since last frame (a release/grip)
 *   - CoM velocity magnitude (motion vs. stillness)
 *   - horizontal CoM motion relative to support center (weight shift)
 *   - whether two limbs share the same hold (match)
 *   - whether a foot is held clearly away from the wall (flag)
 *
 * Output phases are non-overlapping; adjacent phases of the same kind
 * are merged.
 */

export interface SegmentOptions {
  readonly restFrames: number; // min frames of low-motion to count as rest
  readonly dynoMinAirFrames: number; // min frames with <2 contacts to count as dyno
}

const DEFAULTS: SegmentOptions = { restFrames: 12, dynoMinAirFrames: 2 };

export function segmentPhases(
  poses: ReadonlyArray<Pose2D>,
  holds: ReadonlyArray<Hold>,
  fps: number,
  optsIn: Partial<SegmentOptions> = {},
): MovementPhase[] {
  if (poses.length === 0) return [];
  const opts = { ...DEFAULTS, ...optsIn };

  const frameContacts = poses.map((p) => detectContacts(p, holds));
  const frameKinds: PhaseKind[] = poses.map((p, i) =>
    classifyFrame(p, poses[Math.max(0, i - 1)], frameContacts[i], frameContacts[Math.max(0, i - 1)]),
  );

  // Merge low-motion stretches at the ends into `setup`/`rest` rather
  // than leaving them classified as weight_shift.
  smoothShortRuns(frameKinds, opts.dynoMinAirFrames);

  return mergeRuns(frameKinds, frameContacts, poses, fps);
}

function classifyFrame(
  pose: Pose2D,
  prev: Pose2D,
  contacts: ReadonlyArray<LimbContact>,
  prevContacts: ReadonlyArray<LimbContact>,
): PhaseKind {
  const contactCount = contacts.length;

  // Dyno: both feet released OR <2 limbs in contact briefly.
  if (contactCount <= 1) return 'dyno';

  // Match: any two limbs sharing the same hold.
  const holdsTouched = new Map<HoldId, number>();
  for (const c of contacts) {
    holdsTouched.set(c.holdId, (holdsTouched.get(c.holdId) ?? 0) + 1);
  }
  for (const count of holdsTouched.values()) {
    if (count >= 2) return 'match';
  }

  // Flag: one foot clearly away from any hold AND away from the other
  // foot (hip-width+) — counterbalance posture.
  if (isFlagging(pose)) return 'flag';

  // Reach: a hand just left a hold (contact lost) and is now moving
  // toward a new hold.
  if (handContacts(prevContacts) > handContacts(contacts)) return 'reach';

  // Weight shift: CoM x moved appreciably since prev frame.
  const c1 = centerOfMass2D(pose);
  const c0 = centerOfMass2D(prev);
  const dx = Math.abs(c1.x - c0.x);
  if (dx > 0.005) return 'weight_shift';

  return 'setup';
}

function handContacts(contacts: ReadonlyArray<LimbContact>): number {
  return contacts.filter((c) => c.limb === 'left_hand' || c.limb === 'right_hand').length;
}

function isFlagging(pose: Pose2D): boolean {
  const lf = pose.keypoints[JOINT_INDEX.left_ankle];
  const rf = pose.keypoints[JOINT_INDEX.right_ankle];
  const lh = pose.keypoints[JOINT_INDEX.left_hip];
  const rh = pose.keypoints[JOINT_INDEX.right_hip];
  if (!lf || !rf || !lh || !rh) return false;
  const hipWidth = Math.abs(lh.x - rh.x);
  const feetGap = Math.abs(lf.x - rf.x);
  const lfBelowHip = lf.y > (lh.y + rh.y) / 2;
  const rfBelowHip = rf.y > (lh.y + rh.y) / 2;
  // Flag heuristic: feet are separated > 2.2x hip width AND one foot
  // sits notably outside the body outline.
  return feetGap > hipWidth * 2.2 && lfBelowHip && rfBelowHip;
}

function smoothShortRuns(kinds: PhaseKind[], minDyno: number): void {
  // Collapse 1-frame `dyno` blips unless they persist >= minDyno.
  let i = 0;
  while (i < kinds.length) {
    if (kinds[i] === 'dyno') {
      let j = i;
      while (j < kinds.length && kinds[j] === 'dyno') j++;
      const runLen = j - i;
      if (runLen < minDyno) {
        const replacement: PhaseKind = i > 0 ? kinds[i - 1] : 'setup';
        for (let k = i; k < j; k++) kinds[k] = replacement;
      }
      i = j;
    } else {
      i++;
    }
  }
}

function mergeRuns(
  kinds: PhaseKind[],
  frameContacts: ReadonlyArray<ReadonlyArray<LimbContact>>,
  poses: ReadonlyArray<Pose2D>,
  fps: number,
): MovementPhase[] {
  const out: MovementPhase[] = [];
  let start = 0;
  while (start < kinds.length) {
    let end = start;
    while (end < kinds.length && kinds[end] === kinds[start]) end++;
    const startFrame = poses[start].frame;
    const endFrame = poses[end - 1].frame;
    const supporting = collectSupportHoldIds(frameContacts.slice(start, end));
    const targets = collectTargetHoldIds(frameContacts.slice(start, end), supporting);
    out.push({
      kind: kinds[start],
      startFrame,
      endFrame,
      startMs: Math.round((startFrame / fps) * 1000),
      endMs: Math.round((endFrame / fps) * 1000),
      supportingHoldIds: supporting,
      targetHoldIds: targets,
    });
    start = end;
  }
  return out;
}

function collectSupportHoldIds(
  segment: ReadonlyArray<ReadonlyArray<LimbContact>>,
): HoldId[] {
  const counts = new Map<HoldId, number>();
  for (const contacts of segment) {
    for (const c of contacts) {
      if (c.limb === 'left_foot' || c.limb === 'right_foot') {
        counts.set(c.holdId, (counts.get(c.holdId) ?? 0) + 1);
      }
    }
  }
  return [...counts.keys()];
}

function collectTargetHoldIds(
  segment: ReadonlyArray<ReadonlyArray<LimbContact>>,
  supportIds: ReadonlyArray<HoldId>,
): HoldId[] {
  const supportSet = new Set(supportIds);
  const seen = new Set<HoldId>();
  for (const contacts of segment) {
    for (const c of contacts) {
      if ((c.limb === 'left_hand' || c.limb === 'right_hand') && !supportSet.has(c.holdId)) {
        seen.add(c.holdId);
      }
    }
  }
  return [...seen];
}
