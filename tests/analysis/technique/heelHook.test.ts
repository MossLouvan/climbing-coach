import { detectHeelHook } from '@analysis/technique/heelHook';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, footHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectHeelHook', () => {
  it('fires when the ankle is above the hip and above the contacted hold', () => {
    // High hold near shoulder height
    const hold = footHold('h_high', 0.6, 0.35, 0.06);
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        // Right ankle near the high hold (contact) and above hip
        [JOINT_INDEX.right_ankle]: kp(0.6, 0.3, 0.95),
        [JOINT_INDEX.right_knee]: kp(0.55, 0.45, 0.95),
        // Hips around 0.55
        [JOINT_INDEX.left_hip]: kp(0.46, 0.55, 0.95),
        [JOINT_INDEX.right_hip]: kp(0.54, 0.55, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectHeelHook(track, [], [hold]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('heel_hook');
  });

  it('does not fire when the foot is below hip level (standard step)', () => {
    const hold = footHold('h_low', 0.6, 0.9, 0.05);
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.right_ankle]: kp(0.6, 0.9, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectHeelHook(track, [], [hold]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectHeelHook(emptyTrack(), [], [])).toEqual([]);
  });
});
