import {
  JOINT_INDEX,
  type CameraTrack,
  type CameraTrackFrame,
  type FrameIndex,
  type Hold,
  type Keypoint2D,
  type NormalizedPoint2D,
  type Pose2D,
  type PoseTrack,
} from '@domain/models';

export type { CameraTrack, CameraTrackFrame } from '@domain/models';

/**
 * Pose-derived camera-motion tracking.
 *
 * The climbing camera frequently pans/zooms to follow the climber. Holds
 * tagged at a specific frame (in normalized image coordinates) must be
 * re-projected onto later frames so they remain visually "stuck to the
 * wall" as the camera moves.
 *
 * We derive a coarse 2D affine (translation + uniform scale) per frame
 * by tracking stable body anchors — shoulders and hips — across frames.
 * These joints move with the camera frame when the climber's torso is
 * roughly stationary. Arms and legs are intentionally avoided because
 * they move relative to the body and would pollute the motion estimate.
 *
 * This is a simple optical-flow substitute; it won't survive fast
 * dyno-style camera whips, but it's accurate enough for typical
 * bouldering/top-rope footage where the camera slowly follows the
 * climber up the wall.
 */

export interface CameraTrackOptions {
  readonly referenceFrame?: FrameIndex;
  readonly minAnchorCount?: number;
}

/** Joints we use as camera anchors — torso corners. Hands, feet, face
 * keypoints move relative to the body and are excluded. */
const ANCHOR_JOINTS: ReadonlyArray<number> = [
  JOINT_INDEX.left_shoulder,
  JOINT_INDEX.right_shoulder,
  JOINT_INDEX.left_hip,
  JOINT_INDEX.right_hip,
];

const ANCHOR_MIN_CONFIDENCE = 0.5;
const DEFAULT_MIN_ANCHOR_COUNT = 3;
const CONFIDENT_FRAMES_RATIO = 0.7;
const IDENTITY_FRAME = (frame: FrameIndex): CameraTrackFrame => ({
  frame,
  tx: 0,
  ty: 0,
  scale: 1,
});

const MAX_REASONABLE_SCALE = 3;
const MIN_REASONABLE_SCALE = 0.3;
const OFF_SCREEN_MARGIN = 0.1; // allow 10% outside [0,1] before rejecting

/**
 * Compute a per-frame affine transform (translation + uniform scale)
 * that maps the chosen reference frame's torso anchors to each other
 * frame's torso anchors.
 */
export function trackCameraMotion(
  poseTrack: PoseTrack,
  opts: CameraTrackOptions = {},
): CameraTrack {
  const poses = poseTrack.poses2D;
  const referenceFrame = opts.referenceFrame ?? 0;
  const minAnchorCount = opts.minAnchorCount ?? DEFAULT_MIN_ANCHOR_COUNT;
  const fps = poseTrack.fps > 0 ? poseTrack.fps : 30;

  if (poses.length === 0) {
    return { perFrame: [], referenceFrame, confident: false, fps };
  }

  const referencePose =
    poses.find((p) => p.frame === referenceFrame) ?? poses[0];
  const referenceAnchors = collectAnchors(referencePose);

  // If the reference frame has too few anchors, we can't build any
  // transforms — return identities for every frame.
  if (referenceAnchors.size < minAnchorCount) {
    return {
      perFrame: poses.map((p) => IDENTITY_FRAME(p.frame)),
      referenceFrame,
      confident: false,
      fps,
    };
  }

  let confidentFrameCount = 0;
  const perFrame: CameraTrackFrame[] = poses.map((pose) => {
    if (pose.frame === referencePose.frame) {
      confidentFrameCount += 1;
      return IDENTITY_FRAME(pose.frame);
    }
    const frameAnchors = collectAnchors(pose);
    const shared = sharedAnchors(referenceAnchors, frameAnchors);
    if (shared.length < minAnchorCount) {
      return IDENTITY_FRAME(pose.frame);
    }
    const transform = fitTranslationScale(shared);
    if (!transform) return IDENTITY_FRAME(pose.frame);
    confidentFrameCount += 1;
    return { frame: pose.frame, ...transform };
  });

  const confident =
    confidentFrameCount / poses.length >= CONFIDENT_FRAMES_RATIO;

  return {
    perFrame,
    referenceFrame: referencePose.frame,
    confident,
    fps,
  };
}

/**
 * Project a hold's position from its anchor frame to a target frame
 * using the camera track. Returns null when:
 *   - the required transforms aren't available,
 *   - the inferred scale is absurd (<0.3 or >3), or
 *   - the result falls more than 10% outside the [0,1] frame.
 * Returns the hold's original position unchanged when the track is not
 * confident — callers can fall back to the existing time-window filter.
 */
export function projectHold(
  hold: Hold,
  frame: FrameIndex,
  track: CameraTrack,
): NormalizedPoint2D | null {
  if (!track.confident) {
    // Callers fall back to time-window filtering; we still return the
    // raw hold position so a best-effort render stays possible.
    return { x: hold.position.x, y: hold.position.y };
  }

  const anchorFrame = resolveAnchorFrame(hold, track.fps);
  const source = findFrame(track, anchorFrame) ?? IDENTITY_FRAME(anchorFrame);
  const target = findFrame(track, frame) ?? IDENTITY_FRAME(frame);

  // Validate scales before using them.
  if (!isReasonableScale(source.scale) || !isReasonableScale(target.scale)) {
    return null;
  }

  // Map hold -> reference frame (inverse of source), then reference -> target.
  // Forward transform on frame F: p_F = scale_F * p_ref + t_F
  //   Inverse on anchor A:     p_ref = (p_A - t_A) / scale_A
  //   Composition:             p_target = scale_T * ((p_A - t_A) / scale_A) + t_T
  const refX = (hold.position.x - source.tx) / source.scale;
  const refY = (hold.position.y - source.ty) / source.scale;
  const x = target.scale * refX + target.tx;
  const y = target.scale * refY + target.ty;

  if (
    x < -OFF_SCREEN_MARGIN ||
    x > 1 + OFF_SCREEN_MARGIN ||
    y < -OFF_SCREEN_MARGIN ||
    y > 1 + OFF_SCREEN_MARGIN
  ) {
    return null;
  }

  return { x, y };
}

function isReasonableScale(s: number): boolean {
  return Number.isFinite(s) && s >= MIN_REASONABLE_SCALE && s <= MAX_REASONABLE_SCALE;
}

function resolveAnchorFrame(hold: Hold, fps: number): FrameIndex {
  if (hold.anchorFrame !== undefined) return hold.anchorFrame;
  if (hold.capturedAtMs !== undefined && fps > 0) {
    return Math.round((hold.capturedAtMs * fps) / 1000);
  }
  return 0;
}

function findFrame(
  track: CameraTrack,
  frame: FrameIndex,
): CameraTrackFrame | null {
  for (const f of track.perFrame) {
    if (f.frame === frame) return f;
  }
  return null;
}

type AnchorMap = Map<number, Keypoint2D>;

function collectAnchors(pose: Pose2D): AnchorMap {
  const out: AnchorMap = new Map();
  for (const jointIdx of ANCHOR_JOINTS) {
    const kp = pose.keypoints[jointIdx];
    if (!kp) continue;
    if (kp.confidence >= ANCHOR_MIN_CONFIDENCE) {
      out.set(jointIdx, kp);
    }
  }
  return out;
}

interface PointPair {
  readonly ref: { readonly x: number; readonly y: number };
  readonly cur: { readonly x: number; readonly y: number };
}

function sharedAnchors(ref: AnchorMap, cur: AnchorMap): PointPair[] {
  const pairs: PointPair[] = [];
  for (const [jointIdx, refKp] of ref.entries()) {
    const curKp = cur.get(jointIdx);
    if (!curKp) continue;
    pairs.push({
      ref: { x: refKp.x, y: refKp.y },
      cur: { x: curKp.x, y: curKp.y },
    });
  }
  return pairs;
}

/**
 * Fit a similarity transform p_cur = s * p_ref + t (uniform scale +
 * translation, no rotation) to a set of point pairs using a closed-form
 * least-squares estimate.
 *
 * Let (rx, ry) be reference, (cx, cy) be current, N = pairs.length.
 *
 *   rx_bar = mean(rx)          cx_bar = mean(cx)
 *   ry_bar = mean(ry)          cy_bar = mean(cy)
 *   num = Σ [(rx - rx_bar)(cx - cx_bar) + (ry - ry_bar)(cy - cy_bar)]
 *   den = Σ [(rx - rx_bar)^2  + (ry - ry_bar)^2]
 *   s = num / den
 *   tx = cx_bar - s * rx_bar
 *   ty = cy_bar - s * ry_bar
 */
function fitTranslationScale(
  pairs: ReadonlyArray<PointPair>,
): { tx: number; ty: number; scale: number } | null {
  if (pairs.length === 0) return null;

  let rxSum = 0;
  let rySum = 0;
  let cxSum = 0;
  let cySum = 0;
  for (const p of pairs) {
    rxSum += p.ref.x;
    rySum += p.ref.y;
    cxSum += p.cur.x;
    cySum += p.cur.y;
  }
  const n = pairs.length;
  const rxBar = rxSum / n;
  const ryBar = rySum / n;
  const cxBar = cxSum / n;
  const cyBar = cySum / n;

  let num = 0;
  let den = 0;
  for (const p of pairs) {
    const drx = p.ref.x - rxBar;
    const dry = p.ref.y - ryBar;
    const dcx = p.cur.x - cxBar;
    const dcy = p.cur.y - cyBar;
    num += drx * dcx + dry * dcy;
    den += drx * drx + dry * dry;
  }

  // If the reference anchors are (nearly) coincident we can't recover
  // scale from them — fall back to translation-only (scale = 1).
  const scale = den > 1e-9 ? num / den : 1;
  if (!Number.isFinite(scale)) return null;

  const tx = cxBar - scale * rxBar;
  const ty = cyBar - scale * ryBar;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;

  return { tx, ty, scale };
}
