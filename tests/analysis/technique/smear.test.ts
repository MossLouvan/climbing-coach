import { detectSmear } from '@analysis/technique/smear';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, footHold, handHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectSmear', () => {
  const hHold = handHold('h_hand', 0.5, 0.25);
  const fHold = footHold('h_foot', 0.2, 0.9); // far from the smearing foot

  it('fires when a foot is on the wall with no nearby hold while the body is weighted', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        // Left hand ON the hand hold (body weighted)
        [JOINT_INDEX.left_wrist]: kp(0.5, 0.25, 0.95),
        // Right foot far from any hold, but below the hips
        [JOINT_INDEX.right_ankle]: kp(0.7, 0.9, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectSmear(track, [], [hHold, fHold]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('smear');
  });

  it('does not fire when the foot is on a foot hold (not a smear)', () => {
    const nearFoot = footHold('h_foot_near', 0.7, 0.9, 0.04);
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_wrist]: kp(0.5, 0.25, 0.95),
        [JOINT_INDEX.right_ankle]: kp(0.7, 0.9, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectSmear(track, [], [hHold, nearFoot]);
    // The right foot is ON the hold, so no smear
    const rightEvents = events.filter((e) => e.involvedLimbs?.includes('right_foot'));
    expect(rightEvents).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectSmear(emptyTrack(), [], [hHold, fHold])).toEqual([]);
  });
});
