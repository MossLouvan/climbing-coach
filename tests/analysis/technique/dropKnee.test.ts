import { detectDropKnee } from '@analysis/technique/dropKnee';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, footHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectDropKnee', () => {
  const foot = footHold('h_foot', 0.5, 0.9, 0.05);

  it('fires when the knee drops between hip and ankle with foot weighted', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        // Right foot on hold
        [JOINT_INDEX.right_ankle]: kp(0.5, 0.9, 0.95),
        // Right hip normal
        [JOINT_INDEX.right_hip]: kp(0.54, 0.55, 0.95),
        [JOINT_INDEX.left_hip]: kp(0.46, 0.55, 0.95),
        // Right knee "dropped" between hip and ankle (x between 0.5 and 0.54)
        // and below the hip (y > 0.55)
        [JOINT_INDEX.right_knee]: kp(0.52, 0.72, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectDropKnee(track, [], [foot]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('drop_knee');
  });

  it('does not fire when the knee is outside the hip-ankle column', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.right_ankle]: kp(0.5, 0.9, 0.95),
        [JOINT_INDEX.right_hip]: kp(0.54, 0.55, 0.95),
        // Right knee far OUTSIDE the hip-ankle x-range
        [JOINT_INDEX.right_knee]: kp(0.8, 0.72, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectDropKnee(track, [], [foot]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on an empty pose track without throwing', () => {
    expect(() => detectDropKnee(emptyTrack(), [], [foot])).not.toThrow();
    expect(detectDropKnee(emptyTrack(), [], [foot])).toEqual([]);
  });
});
