import {
  JOINT_INDEX,
  type Joint3D,
  type Keypoint2D,
  type Pose2D,
  type Pose3D,
  type PoseTrack,
} from '@domain/models';

import {
  DEFAULT_HEIGHT_M,
  type SegmentLengths,
  segmentLengthsForHeight,
} from './anthropometrics';

/**
 * Pseudo-3D pose lifter.
 *
 * What this IS:
 *   A transparent, interpretable depth estimator for climbing poses
 *   captured from a roughly wall-facing phone camera. It assumes:
 *     - the camera is approximately orthographic in the relevant ROI
 *       (valid for far-field shots; weak-perspective for phone video)
 *     - the climber has known bone lengths (derived from height)
 *     - the wall is roughly parallel to the image plane
 *   Given the 2D projection and bone lengths, it solves for each joint's
 *   depth offset `z` such that the parent→child segment has the correct
 *   length in 3D.
 *
 * What this IS NOT:
 *   A learned monocular 3D pose network. We deliberately keep this
 *   deterministic and explainable so the coaching feedback can cite
 *   specific geometric reasons ("hip is ~15cm off the wall").
 *
 * Ambiguity: the sign of `z` is inherently ambiguous from a single
 * frame. We resolve it with a climbing-specific prior: elbows bow
 * AWAY from the wall, knees bow AWAY from the wall, the head leans
 * AWAY from the wall (+z), while the torso and hips stay close to z≈0.
 * This is wrong for some overhang configurations, and we document it.
 */
export class PseudoLifter {
  private readonly segments: SegmentLengths;
  /** Pixels per meter, estimated from the first reliable frame. */
  private pxPerMeter: number | null = null;

  constructor(opts: { readonly heightM?: number } = {}) {
    this.segments = segmentLengthsForHeight(opts.heightM ?? DEFAULT_HEIGHT_M);
  }

  lift(track: {
    readonly fps: number;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly poses2D: ReadonlyArray<Pose2D>;
  }): PoseTrack {
    this.pxPerMeter = this.estimatePxPerMeter(track);
    const poses3D = track.poses2D.map((p) => this.liftFrame(p, track.widthPx, track.heightPx));
    return {
      fps: track.fps,
      widthPx: track.widthPx,
      heightPx: track.heightPx,
      poses2D: track.poses2D,
      poses3D,
    };
  }

  /** Estimate pixel-scale by finding the frame with clearest torso length. */
  private estimatePxPerMeter(track: {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly poses2D: ReadonlyArray<Pose2D>;
  }): number {
    let best = 0;
    let bestPx = 0;
    const torsoM = this.segments.torso;
    for (const pose of track.poses2D) {
      const ls = pose.keypoints[JOINT_INDEX.left_shoulder];
      const rs = pose.keypoints[JOINT_INDEX.right_shoulder];
      const lh = pose.keypoints[JOINT_INDEX.left_hip];
      const rh = pose.keypoints[JOINT_INDEX.right_hip];
      if (!ls || !rs || !lh || !rh) continue;
      const conf = Math.min(ls.confidence, rs.confidence, lh.confidence, rh.confidence);
      if (conf < 0.5) continue;
      const shoulderMidY = ((ls.y + rs.y) / 2) * track.heightPx;
      const hipMidY = ((lh.y + rh.y) / 2) * track.heightPx;
      const torsoPx = Math.abs(hipMidY - shoulderMidY);
      if (conf > best) {
        best = conf;
        bestPx = torsoPx;
      }
    }
    if (bestPx === 0) {
      // Fallback: assume the climber occupies ~60% of frame height.
      return (track.heightPx * 0.6) / DEFAULT_HEIGHT_M;
    }
    return bestPx / torsoM;
  }

  private liftFrame(pose: Pose2D, widthPx: number, heightPx: number): Pose3D {
    const ppm = this.pxPerMeter ?? (heightPx * 0.6) / DEFAULT_HEIGHT_M;
    const toMeters = (kp: Keypoint2D) => ({
      x: ((kp.x - 0.5) * widthPx) / ppm,
      y: ((0.5 - kp.y) * heightPx) / ppm, // flip y so +y is up
      confidence: kp.confidence,
    });

    const k = pose.keypoints.map(toMeters);

    // Hip/shoulder midpoints are our z=0 reference.
    const midHipX = (k[JOINT_INDEX.left_hip].x + k[JOINT_INDEX.right_hip].x) / 2;
    const midHipY = (k[JOINT_INDEX.left_hip].y + k[JOINT_INDEX.right_hip].y) / 2;
    const joints: Joint3D[] = pose.keypoints.map((kp) => ({
      x: ((kp.x - 0.5) * widthPx) / ppm - midHipX,
      y: ((0.5 - kp.y) * heightPx) / ppm - midHipY,
      z: 0,
      confidence: kp.confidence,
    }));

    // Solve z for each joint given parent joint and expected length.
    const solve = (childIdx: number, parentIdx: number, L: number, zPrior: number) => {
      const parent = joints[parentIdx];
      const child = joints[childIdx];
      const dx = child.x - parent.x;
      const dy = child.y - parent.y;
      const projected2 = dx * dx + dy * dy;
      const L2 = L * L;
      // dz^2 = L^2 - projected^2, clamped to non-negative.
      const dz = projected2 >= L2 ? 0 : Math.sqrt(L2 - projected2);
      const z = parent.z + zPrior * dz;
      (joints[childIdx] as { z: number }).z = z;
    };

    // Arms: elbows bow AWAY from wall (+z prior); wrists return toward
    // the wall (they're on holds), so wrist z prior is -1.
    solve(JOINT_INDEX.left_elbow, JOINT_INDEX.left_shoulder, this.segments.upperArm, +1);
    solve(JOINT_INDEX.left_wrist, JOINT_INDEX.left_elbow, this.segments.forearm, -1);
    solve(JOINT_INDEX.right_elbow, JOINT_INDEX.right_shoulder, this.segments.upperArm, +1);
    solve(JOINT_INDEX.right_wrist, JOINT_INDEX.right_elbow, this.segments.forearm, -1);

    // Legs: knees bow AWAY from the wall on most static positions.
    solve(JOINT_INDEX.left_knee, JOINT_INDEX.left_hip, this.segments.thigh, +1);
    solve(JOINT_INDEX.left_ankle, JOINT_INDEX.left_knee, this.segments.shank, -1);
    solve(JOINT_INDEX.right_knee, JOINT_INDEX.right_hip, this.segments.thigh, +1);
    solve(JOINT_INDEX.right_ankle, JOINT_INDEX.right_knee, this.segments.shank, -1);

    // Head leans slightly away from the wall when looking up.
    solve(JOINT_INDEX.nose, JOINT_INDEX.left_shoulder, this.segments.neck + this.segments.shoulderWidth / 2, +0.5);

    // Confidence in the lift: mean 2D confidence * penalty for frames
    // where projected lengths exceed expected bone lengths (indicating
    // camera foreshortening broke our assumptions).
    const meanConf = pose.keypoints.reduce((s, p) => s + p.confidence, 0) / pose.keypoints.length;
    const foreshorteningPenalty = this.foreshorteningPenalty(joints);
    const liftConfidence = Math.max(0, Math.min(1, meanConf * foreshorteningPenalty));

    return {
      frame: pose.frame,
      timestampMs: pose.timestampMs,
      joints,
      liftConfidence,
    };
  }

  private foreshorteningPenalty(joints: ReadonlyArray<Joint3D>): number {
    const pairs: Array<[number, number, number]> = [
      [JOINT_INDEX.left_shoulder, JOINT_INDEX.left_elbow, this.segments.upperArm],
      [JOINT_INDEX.left_elbow, JOINT_INDEX.left_wrist, this.segments.forearm],
      [JOINT_INDEX.right_shoulder, JOINT_INDEX.right_elbow, this.segments.upperArm],
      [JOINT_INDEX.right_elbow, JOINT_INDEX.right_wrist, this.segments.forearm],
      [JOINT_INDEX.left_hip, JOINT_INDEX.left_knee, this.segments.thigh],
      [JOINT_INDEX.right_hip, JOINT_INDEX.right_knee, this.segments.thigh],
    ];
    let total = 0;
    for (const [a, b, L] of pairs) {
      const ja = joints[a];
      const jb = joints[b];
      const dx = jb.x - ja.x;
      const dy = jb.y - ja.y;
      const projected = Math.sqrt(dx * dx + dy * dy);
      const ratio = projected / L; // ideally ≤ 1
      // Penalize heavy projected-over-actual ratios.
      total += Math.max(0, 1 - Math.abs(ratio - 0.8));
    }
    return total / pairs.length;
  }
}
