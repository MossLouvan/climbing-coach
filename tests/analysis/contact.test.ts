import { detectContacts } from '@analysis/holds/contact';
import { supportRegion } from '@analysis/holds/supportPolygon';
import {
  JOINT_INDEX,
  JOINT_NAMES,
  makeId,
  type Hold,
  type HoldId,
  type Keypoint2D,
  type Pose2D,
  type RouteId,
} from '@domain/models';

function kp(x: number, y: number, c = 0.9): Keypoint2D {
  return { x, y, confidence: c };
}

function emptyPose(): Pose2D {
  return {
    frame: 0,
    timestampMs: 0,
    keypoints: JOINT_NAMES.map(() => kp(0.5, 0.5, 0.9)),
    score: 0.9,
  };
}

function setKp(pose: Pose2D, idx: number, point: Keypoint2D): Pose2D {
  const kps = pose.keypoints.slice() as Keypoint2D[];
  kps[idx] = point;
  return { ...pose, keypoints: kps };
}

const RID = makeId<'Route'>('r1') as RouteId;
const HID = (s: string) => makeId<'Hold'>(s) as HoldId;

const handHold: Hold = {
  id: HID('h_hand'),
  routeId: RID,
  position: { x: 0.5, y: 0.3 },
  radius: 0.05,
  type: 'jug',
  role: 'intermediate',
  intendedLimb: 'right_hand',
};
const footHold: Hold = {
  id: HID('h_foot'),
  routeId: RID,
  position: { x: 0.5, y: 0.85 },
  radius: 0.04,
  type: 'foot_chip',
  role: 'foot_only',
  intendedLimb: 'left_foot',
};

describe('detectContacts', () => {
  it('registers a hand in contact when wrist is within the hold radius * slack', () => {
    let pose = emptyPose();
    pose = setKp(pose, JOINT_INDEX.right_wrist, kp(0.5, 0.3, 0.95));
    const contacts = detectContacts(pose, [handHold, footHold]);
    expect(contacts.some((c) => c.limb === 'right_hand' && c.holdId === handHold.id)).toBe(true);
  });

  it('refuses contact when wrist is far from all holds', () => {
    let pose = emptyPose();
    pose = setKp(pose, JOINT_INDEX.right_wrist, kp(0.1, 0.1, 0.95));
    const contacts = detectContacts(pose, [handHold, footHold]);
    expect(contacts.find((c) => c.limb === 'right_hand')).toBeUndefined();
  });

  it('respects intendedLimb — foot-only hold cannot be a hand contact', () => {
    let pose = emptyPose();
    pose = setKp(pose, JOINT_INDEX.right_wrist, kp(0.5, 0.85, 0.95));
    const contacts = detectContacts(pose, [footHold]);
    expect(contacts.find((c) => c.limb === 'right_hand')).toBeUndefined();
  });

  it('drops low-confidence keypoints', () => {
    let pose = emptyPose();
    pose = setKp(pose, JOINT_INDEX.right_wrist, kp(0.5, 0.3, 0.1));
    const contacts = detectContacts(pose, [handHold]);
    expect(contacts.length).toBe(0);
  });
});

describe('supportRegion', () => {
  it('weights feet more heavily than hands', () => {
    const region = supportRegion(
      [
        { limb: 'left_foot', holdId: footHold.id, distanceNorm: 0.01 },
        { limb: 'right_hand', holdId: handHold.id, distanceNorm: 0.01 },
      ],
      [handHold, footHold],
    );
    // center y should be closer to the foot hold (0.85) than hand (0.3).
    expect(region.center.y).toBeGreaterThan(0.6);
  });

  it('returns zero-weight region when no contacts are given', () => {
    const region = supportRegion([], [handHold, footHold]);
    expect(region.weight).toBe(0);
  });
});
