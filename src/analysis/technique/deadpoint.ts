import { centerOfMass2D } from '@analysis/kinematics/centerOfMass';
import {
  type Hold,
  type MovementPhase,
  type PoseTrack,
  type TechniqueEvent,
} from '@domain/models';

import {
  buildFrameContexts,
  eventFromRun,
  phasesOverlapping,
} from './_helpers';

/**
 * Detect "deadpoint" — in a reach or dyno phase, vertical CoM
 * velocity crosses zero (momentarily weightless at the top of an
 * upward motion) AT or near the same frame a NEW hand contact is
 * registered.
 *
 * We emit a 1-frame wide event centered on the detected frame. We
 * keep confidence conservative because momentary stall detection
 * from ~30Hz poses is noisy.
 */
export function detectDeadpoint(
  poseTrack: PoseTrack,
  phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  const poses = poseTrack.poses2D;
  if (poses.length < 3) return [];

  const ctxs = buildFrameContexts(poseTrack, holds);
  const comY: number[] = poses.map((p) => centerOfMass2D(p).y);

  const out: TechniqueEvent[] = [];
  const activePhases = phases.filter((p) => p.kind === 'reach' || p.kind === 'dyno');

  for (let i = 1; i < poses.length - 1; i++) {
    // In image coords +y is DOWN, so upward motion means y decreases;
    // the top of an upward reach is a LOCAL MIN in y.
    const prev = comY[i - 1];
    const cur = comY[i];
    const next = comY[i + 1];
    if (!(cur <= prev && cur <= next)) continue;
    // Movement must be non-trivial to count as a stall
    if (Math.abs(prev - cur) < 0.003 && Math.abs(next - cur) < 0.003) continue;

    const frame = poses[i].frame;
    const overlapping = phasesOverlapping(activePhases, frame, frame);
    if (overlapping.length === 0) continue;

    // New hand contact (present now, absent at i-1)?
    const prevHandHolds = new Set(
      ctxs[i - 1].contacts
        .filter((c) => c.limb === 'left_hand' || c.limb === 'right_hand')
        .map((c) => c.holdId),
    );
    const curHand = ctxs[i].contacts.find(
      (c) =>
        (c.limb === 'left_hand' || c.limb === 'right_hand') &&
        !prevHandHolds.has(c.holdId),
    );
    if (!curHand) continue;

    out.push(
      eventFromRun({
        kind: 'deadpoint',
        track: poseTrack,
        startIdx: i,
        endIdx: i,
        confidence: 0.55,
        evidence:
          'Vertical CoM stalled at the top of an upward motion as a new hand contact registered.',
        involvedLimbs: [curHand.limb],
        relatedHoldIds: [curHand.holdId],
      }),
    );
  }
  return out;
}
