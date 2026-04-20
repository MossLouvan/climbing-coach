import { detectLockoff } from '@analysis/technique/lockoff';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, handHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectLockoff', () => {
  const hold = handHold('h_lock', 0.4, 0.2, 0.05);

  it('fires when an elbow is held below 90 degrees for > 1s while the hand is in contact', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        // Left shoulder
        [JOINT_INDEX.left_shoulder]: kp(0.4, 0.35, 0.95),
        // Left wrist near the hold
        [JOINT_INDEX.left_wrist]: kp(0.4, 0.2, 0.95),
        // Left elbow bent sharply — wrist is directly above elbow, elbow near shoulder
        // shoulder -> elbow vector points down-right, elbow -> wrist points up — ~90 degrees
        // Make angle clearly acute: elbow between shoulder and wrist in x, but closer to both
        [JOINT_INDEX.left_elbow]: kp(0.32, 0.28, 0.95),
      });
    }, 1500, 30);
    const track = makeTrack(poses);
    const events = detectLockoff(track, [], [hold]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('lockoff');
  });

  it('does not fire when the elbow is extended (arm hanging straight)', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_shoulder]: kp(0.4, 0.2, 0.95),
        [JOINT_INDEX.left_elbow]: kp(0.4, 0.35, 0.95),
        [JOINT_INDEX.left_wrist]: kp(0.4, 0.5, 0.95),
      });
    }, 1500, 30);
    const track = makeTrack(poses);
    const events = detectLockoff(track, [], [hold]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectLockoff(emptyTrack(), [], [hold])).toEqual([]);
  });
});
