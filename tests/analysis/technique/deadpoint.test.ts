import { detectDeadpoint } from '@analysis/technique/deadpoint';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, handHold, kp, makeTrack, neutralPose, phase } from './_fixtures';

describe('detectDeadpoint', () => {
  const targetHold = handHold('h_target', 0.5, 0.15, 0.06);

  it('fires when CoM peaks upward as a new hand contact registers in a reach phase', () => {
    const fps = 30;
    const poses = [
      // Frame 0: body low, hand not yet on target
      neutralPose(0, 0, {
        [JOINT_INDEX.left_wrist]: kp(0.3, 0.3, 0.95),
        [JOINT_INDEX.right_wrist]: kp(0.7, 0.3, 0.95),
      }, 0.5, 0.7),
      // Frame 1: body moving up, approaching hold
      neutralPose(1, 33, {
        [JOINT_INDEX.left_wrist]: kp(0.3, 0.2, 0.95),
        [JOINT_INDEX.right_wrist]: kp(0.7, 0.2, 0.95),
      }, 0.5, 0.55),
      // Frame 2: CoM peak, right wrist lands ON hold
      neutralPose(2, 66, {
        [JOINT_INDEX.left_wrist]: kp(0.3, 0.2, 0.95),
        [JOINT_INDEX.right_wrist]: kp(0.5, 0.15, 0.95),
      }, 0.5, 0.5),
      // Frame 3: falling slightly
      neutralPose(3, 100, {
        [JOINT_INDEX.left_wrist]: kp(0.3, 0.2, 0.95),
        [JOINT_INDEX.right_wrist]: kp(0.5, 0.15, 0.95),
      }, 0.5, 0.55),
    ];
    const track = makeTrack(poses, fps);
    const reachPhase = phase('reach', 0, 3);
    const events = detectDeadpoint(track, [reachPhase], [targetHold]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('deadpoint');
  });

  it('does not fire outside a reach/dyno phase', () => {
    const fps = 30;
    const poses = [
      neutralPose(0, 0, { [JOINT_INDEX.right_wrist]: kp(0.3, 0.3, 0.95) }, 0.5, 0.7),
      neutralPose(1, 33, { [JOINT_INDEX.right_wrist]: kp(0.4, 0.2, 0.95) }, 0.5, 0.55),
      neutralPose(2, 66, { [JOINT_INDEX.right_wrist]: kp(0.5, 0.15, 0.95) }, 0.5, 0.5),
      neutralPose(3, 100, { [JOINT_INDEX.right_wrist]: kp(0.5, 0.15, 0.95) }, 0.5, 0.55),
    ];
    const track = makeTrack(poses, fps);
    const setupPhase = phase('setup', 0, 3);
    const events = detectDeadpoint(track, [setupPhase], [targetHold]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectDeadpoint(emptyTrack(), [], [targetHold])).toEqual([]);
  });
});
