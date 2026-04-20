import { detectDyno } from '@analysis/technique/dyno';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, footHold, handHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectDyno', () => {
  const hHold = handHold('h_h', 0.5, 0.2);
  const fHold = footHold('h_f', 0.5, 0.9);

  it('fires when all limbs are off contact for ≥ 150ms', () => {
    // Put all limbs far from any hold
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_wrist]: kp(0.1, 0.5, 0.95),
        [JOINT_INDEX.right_wrist]: kp(0.9, 0.5, 0.95),
        [JOINT_INDEX.left_ankle]: kp(0.1, 0.6, 0.95),
        [JOINT_INDEX.right_ankle]: kp(0.9, 0.6, 0.95),
      });
    }, 300, 30);
    const track = makeTrack(poses);
    const events = detectDyno(track, [], [hHold, fHold]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('dyno');
  });

  it('does not fire when at least one limb has contact throughout', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.right_wrist]: kp(0.5, 0.2, 0.95),
      });
    }, 300, 30);
    const track = makeTrack(poses);
    const events = detectDyno(track, [], [hHold, fHold]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectDyno(emptyTrack(), [], [hHold, fHold])).toEqual([]);
  });
});
