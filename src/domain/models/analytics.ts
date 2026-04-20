import type {
  Confidence,
  FrameIndex,
  NormalizedPoint2D,
  Point3D,
} from './common';

/**
 * Per-frame balance/CoM analytics. Derived from Pose2D + optional Pose3D +
 * the phase timeline. Downstream consumers (scoring, overlays) read this
 * instead of recomputing CoM / balance predicates for each feature.
 *
 * All fields are defined for every frame we emit — we never leak NaN
 * downstream. When a measurement cannot be computed (no 3D lift, no
 * support polygon yet) we either omit it (optional fields) or fall back
 * to a conservative default (`comInsideSupport = true`,
 * `bodySwingDegPerSec = 0`).
 */
export interface FrameAnalytics {
  readonly frame: FrameIndex;
  readonly timestampMs: number;
  readonly com2D: NormalizedPoint2D;
  readonly com3D?: Point3D;
  readonly hip2D: NormalizedPoint2D;
  readonly hipToWallMeters?: number;
  readonly comInsideSupport: boolean;
  /** Signed angular velocity of the torso vector. Positive = rotating right. */
  readonly bodySwingDegPerSec: number;
  /** Minimum of the contributing keypoint confidences (shoulders + hips). */
  readonly confidence: Confidence;
}

export interface AnalyticsTrack {
  readonly fps: number;
  readonly perFrame: ReadonlyArray<FrameAnalytics>;
}
