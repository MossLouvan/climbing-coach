import { JOINT_INDEX, type Pose2D, type Pose3D } from '@domain/models';

/**
 * Body-segment mass fractions (Winter, "Biomechanics & Motor Control").
 * Center-of-mass (CoM) is the mass-weighted average of segment centers.
 *
 * For coaching-quality analysis we compute CoM from a reduced set of
 * segments: head, trunk, upper arms, forearms, thighs, shanks.
 * Hands and feet contribute ~1% each and are folded into forearms/shanks.
 */
const MASS_FRACTIONS = {
  head: 0.081,
  trunk: 0.497,
  upperArm: 0.028, // each side
  forearmHand: 0.022, // each side (forearm + hand)
  thigh: 0.1, // each side
  shankFoot: 0.061, // each side (shank + foot)
} as const;

/** Total must equal 1. */
const TOTAL =
  MASS_FRACTIONS.head +
  MASS_FRACTIONS.trunk +
  2 * MASS_FRACTIONS.upperArm +
  2 * MASS_FRACTIONS.forearmHand +
  2 * MASS_FRACTIONS.thigh +
  2 * MASS_FRACTIONS.shankFoot;

interface Point2 {
  readonly x: number;
  readonly y: number;
}
interface Point3 extends Point2 {
  readonly z: number;
}

export function centerOfMass2D(pose: Pose2D): Point2 {
  const k = pose.keypoints;
  const midShoulder = mid2(k[JOINT_INDEX.left_shoulder], k[JOINT_INDEX.right_shoulder]);
  const midHip = mid2(k[JOINT_INDEX.left_hip], k[JOINT_INDEX.right_hip]);

  const segCenters: Array<[Point2, number]> = [
    [mid2(k[JOINT_INDEX.nose], midShoulder), MASS_FRACTIONS.head],
    [mid2(midShoulder, midHip), MASS_FRACTIONS.trunk],
    [mid2(k[JOINT_INDEX.left_shoulder], k[JOINT_INDEX.left_elbow]), MASS_FRACTIONS.upperArm],
    [mid2(k[JOINT_INDEX.right_shoulder], k[JOINT_INDEX.right_elbow]), MASS_FRACTIONS.upperArm],
    [mid2(k[JOINT_INDEX.left_elbow], k[JOINT_INDEX.left_wrist]), MASS_FRACTIONS.forearmHand],
    [mid2(k[JOINT_INDEX.right_elbow], k[JOINT_INDEX.right_wrist]), MASS_FRACTIONS.forearmHand],
    [mid2(k[JOINT_INDEX.left_hip], k[JOINT_INDEX.left_knee]), MASS_FRACTIONS.thigh],
    [mid2(k[JOINT_INDEX.right_hip], k[JOINT_INDEX.right_knee]), MASS_FRACTIONS.thigh],
    [mid2(k[JOINT_INDEX.left_knee], k[JOINT_INDEX.left_ankle]), MASS_FRACTIONS.shankFoot],
    [mid2(k[JOINT_INDEX.right_knee], k[JOINT_INDEX.right_ankle]), MASS_FRACTIONS.shankFoot],
  ];
  return weighted2(segCenters);
}

export function centerOfMass3D(pose: Pose3D): Point3 {
  const j = pose.joints;
  const midShoulder = mid3(j[JOINT_INDEX.left_shoulder], j[JOINT_INDEX.right_shoulder]);
  const midHip = mid3(j[JOINT_INDEX.left_hip], j[JOINT_INDEX.right_hip]);

  const segCenters: Array<[Point3, number]> = [
    [mid3(j[JOINT_INDEX.nose], midShoulder), MASS_FRACTIONS.head],
    [mid3(midShoulder, midHip), MASS_FRACTIONS.trunk],
    [mid3(j[JOINT_INDEX.left_shoulder], j[JOINT_INDEX.left_elbow]), MASS_FRACTIONS.upperArm],
    [mid3(j[JOINT_INDEX.right_shoulder], j[JOINT_INDEX.right_elbow]), MASS_FRACTIONS.upperArm],
    [mid3(j[JOINT_INDEX.left_elbow], j[JOINT_INDEX.left_wrist]), MASS_FRACTIONS.forearmHand],
    [mid3(j[JOINT_INDEX.right_elbow], j[JOINT_INDEX.right_wrist]), MASS_FRACTIONS.forearmHand],
    [mid3(j[JOINT_INDEX.left_hip], j[JOINT_INDEX.left_knee]), MASS_FRACTIONS.thigh],
    [mid3(j[JOINT_INDEX.right_hip], j[JOINT_INDEX.right_knee]), MASS_FRACTIONS.thigh],
    [mid3(j[JOINT_INDEX.left_knee], j[JOINT_INDEX.left_ankle]), MASS_FRACTIONS.shankFoot],
    [mid3(j[JOINT_INDEX.right_knee], j[JOINT_INDEX.right_ankle]), MASS_FRACTIONS.shankFoot],
  ];
  return weighted3(segCenters);
}

export const MASS_FRACTION_SUM = TOTAL;

function mid2(a: Point2, b: Point2): Point2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function mid3(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}
function weighted2(pairs: ReadonlyArray<[Point2, number]>): Point2 {
  let x = 0;
  let y = 0;
  let w = 0;
  for (const [p, m] of pairs) {
    x += p.x * m;
    y += p.y * m;
    w += m;
  }
  return { x: x / w, y: y / w };
}
function weighted3(pairs: ReadonlyArray<[Point3, number]>): Point3 {
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 0;
  for (const [p, m] of pairs) {
    x += p.x * m;
    y += p.y * m;
    z += p.z * m;
    w += m;
  }
  return { x: x / w, y: y / w, z: z / w };
}
