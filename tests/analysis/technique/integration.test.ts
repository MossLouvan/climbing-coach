import { detectTechniqueEvents } from '@analysis/technique';
import { JOINT_INDEX, type Pose2D } from '@domain/models';

import { emptyTrack, footHold, handHold, kp, makeTrack, neutralPose, phase } from './_fixtures';

describe('detectTechniqueEvents (integration)', () => {
  it('returns [] for an empty track without throwing', () => {
    expect(() => detectTechniqueEvents(emptyTrack(), [], [])).not.toThrow();
    expect(detectTechniqueEvents(emptyTrack(), [], [])).toEqual([]);
  });

  it('returns events sorted by startFrame across multiple kinds', () => {
    const handH = handHold('h_match', 0.5, 0.2, 0.06);
    const footH = footHold('h_foot', 0.4, 0.9, 0.04);
    const holds = [handH, footH];

    // Build a synthetic track with two clear segments:
    //  1) 400ms where both hands overlap the match hold  -> match
    //  2) 300ms where right foot backsteps to the left side of hip -> backstep
    //
    // The backstep segment must also have right ankle on the hold at x=0.25
    // (we add one) so detectContacts fires.
    const backstepHold = footHold('h_back', 0.25, 0.9, 0.05);
    const poses: Pose2D[] = [];
    // 12 frames (400ms) of matching
    for (let i = 0; i < 12; i++) {
      poses.push(
        neutralPose(i, Math.round((i / 30) * 1000), {
          [JOINT_INDEX.left_wrist]: kp(0.49, 0.2, 0.95),
          [JOINT_INDEX.right_wrist]: kp(0.51, 0.2, 0.95),
        }),
      );
    }
    // 12 frames (400ms) of backstep: hips centered, right ankle on the LEFT hold
    for (let i = 12; i < 24; i++) {
      poses.push(
        neutralPose(i, Math.round((i / 30) * 1000), {
          [JOINT_INDEX.left_hip]: kp(0.46, 0.55, 0.95),
          [JOINT_INDEX.right_hip]: kp(0.54, 0.55, 0.95),
          [JOINT_INDEX.right_ankle]: kp(0.25, 0.9, 0.95),
          // Move wrists off the match hold so we don't keep registering it
          [JOINT_INDEX.left_wrist]: kp(0.2, 0.5, 0.95),
          [JOINT_INDEX.right_wrist]: kp(0.8, 0.5, 0.95),
        }),
      );
    }
    const track = makeTrack(poses, 30);
    const phases = [phase('match', 0, 11), phase('setup', 12, 23)];
    const events = detectTechniqueEvents(track, phases, [...holds, backstepHold]);

    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].startFrame).toBeGreaterThanOrEqual(events[i - 1].startFrame);
    }
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has('match')).toBe(true);
    expect(kinds.has('backstep')).toBe(true);
  });

  it('never throws on short/malformed tracks', () => {
    // Single-pose track
    const track = makeTrack(
      [
        neutralPose(0, 0, {
          [JOINT_INDEX.left_shoulder]: kp(0.4, 0.3, 0.1),
          [JOINT_INDEX.right_shoulder]: kp(0.6, 0.3, 0.1),
        }),
      ],
      30,
    );
    expect(() => detectTechniqueEvents(track, [], [])).not.toThrow();
  });
});
