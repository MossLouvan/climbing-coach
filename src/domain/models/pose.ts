import type {
  Confidence,
  FrameIndex,
  NormalizedPoint2D,
  Point3D,
} from './common';

/**
 * 17-point pose topology. Matches COCO / MoveNet keypoint order so
 * swapping in a real inference backend (MoveNet, BlazePose-Lite, PoseNet)
 * doesn't require remapping indices.
 */
export const JOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

export type JointName = (typeof JOINT_NAMES)[number];

export const JOINT_INDEX: Readonly<Record<JointName, number>> = JOINT_NAMES.reduce(
  (acc, name, idx) => {
    (acc as Record<JointName, number>)[name] = idx;
    return acc;
  },
  {} as Record<JointName, number>,
);

/** Bone connectivity for drawing skeletons — child → parent pairs. */
export const SKELETON_BONES: ReadonlyArray<readonly [JointName, JointName]> = [
  ['left_shoulder', 'right_shoulder'],
  ['left_hip', 'right_hip'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

export interface Keypoint2D extends NormalizedPoint2D {
  readonly confidence: Confidence;
}

export interface Pose2D {
  readonly frame: FrameIndex;
  readonly timestampMs: number;
  /** Fixed-length array aligned with JOINT_NAMES. */
  readonly keypoints: ReadonlyArray<Keypoint2D>;
  /** Overall pose confidence (e.g. mean of keypoint confidences). */
  readonly score: Confidence;
}

export interface Joint3D extends Point3D {
  readonly confidence: Confidence;
}

export interface Pose3D {
  readonly frame: FrameIndex;
  readonly timestampMs: number;
  readonly joints: ReadonlyArray<Joint3D>;
  /** Confidence that this 3D lift is trustworthy for scoring. */
  readonly liftConfidence: Confidence;
}

/**
 * Where this pose track came from — used to decide whether to render
 * the skeleton over a real video. Synthetic tracks are misleading when
 * overlaid on real footage (hardcoded motion won't match the climber).
 */
export type PoseSource = 'mock' | 'moveNet' | 'vision' | 'external';

export interface PoseTrack {
  readonly fps: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly poses2D: ReadonlyArray<Pose2D>;
  readonly poses3D: ReadonlyArray<Pose3D>;
  readonly source: PoseSource;
}
