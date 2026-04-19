import { JOINT_NAMES, type Keypoint2D, type Pose2D } from '@domain/models';

import type {
  PoseInferenceProgress,
  PoseInferenceRequest,
  PoseInferenceResult,
  PoseProvider,
} from './PoseProvider';

/**
 * A deterministic pose provider that synthesizes a plausible climbing
 * movement trace. This is NOT real inference — it exists so that:
 *
 *   1. The app is fully demoable in Expo Go with no native build.
 *   2. Tests of the scoring / phase / viz pipelines have stable input.
 *
 * The motion modeled:
 *   - climber starts with both hands on a start hold (low)
 *   - reaches up-right with the right hand
 *   - flags left foot
 *   - matches on the target hold
 *
 * The trace is expressed in normalized image coordinates. It is biased
 * toward the left side of the frame to match a wall-mounted camera
 * slightly left-of-center — realistic for phone tripods.
 *
 * The UI clearly badges sessions produced by this provider as "demo".
 */
export class MockPoseProvider implements PoseProvider {
  public readonly name = 'mock-seeded-v1';
  public readonly isRealInference = false;

  constructor(
    private readonly opts: {
      readonly seed?: number;
      readonly durationSec?: number;
    } = {},
  ) {}

  async infer(
    request: PoseInferenceRequest,
    onProgress?: (p: PoseInferenceProgress) => void,
  ): Promise<PoseInferenceResult> {
    const durationSec = this.opts.durationSec ?? 6;
    const fps = Math.max(1, Math.min(30, request.targetFps));
    const totalFrames = Math.floor(durationSec * fps);
    const rand = seededRand(this.opts.seed ?? 42);
    const poses: Pose2D[] = [];

    for (let f = 0; f < totalFrames; f++) {
      const t = f / totalFrames; // 0..1 across the climb
      const keypoints = synthPose(t, rand);
      poses.push({
        frame: f,
        timestampMs: Math.round((f / fps) * 1000),
        keypoints,
        score: 0.85,
      });
      if (onProgress && f % 5 === 0) {
        onProgress({ framesProcessed: f, framesTotal: totalFrames });
      }
    }
    onProgress?.({ framesProcessed: totalFrames, framesTotal: totalFrames });

    return {
      fps,
      widthPx: request.widthPx,
      heightPx: request.heightPx,
      poses2D: poses,
      providerName: this.name,
      isRealInference: false,
    };
  }
}

/**
 * Small, explicit phase-parameterized synth rather than a free-form
 * noise loop. Keeping this interpretable means scoring tests remain
 * meaningful.
 */
function synthPose(t: number, rand: () => number): Keypoint2D[] {
  // Anchor points on the wall (normalized). These implicitly define the
  // seeded "route": a low start hold and a high-right target.
  const startX = 0.42;
  const startY = 0.72;
  const targetX = 0.63;
  const targetY = 0.3;

  // Reach progress: 0 → 1 during phase [0.2, 0.7], else held.
  const reach = smoothstep(0.2, 0.7, t);
  const match = smoothstep(0.7, 0.92, t);

  const rightHandX = lerp(startX + 0.02, targetX, reach);
  const rightHandY = lerp(startY - 0.02, targetY, reach);
  const leftHandX = lerp(startX - 0.02, targetX - 0.02, match);
  const leftHandY = lerp(startY - 0.02, targetY + 0.01, match);

  // Hip tracks toward the wall-aligned average of supporting holds
  // but lags — the climber shifts weight just before the reach.
  const hipCenterX = lerp(0.5, 0.55, smoothstep(0.1, 0.5, t));
  const hipCenterY = lerp(0.85, 0.75, smoothstep(0.15, 0.65, t));

  const shoulderY = hipCenterY - 0.24;
  const headY = shoulderY - 0.1;

  // Left foot flags out-and-down during the reach, then tucks back.
  const flagAmount = bell(t, 0.55, 0.08); // peaks mid-reach
  const leftFootX = hipCenterX - 0.05 - 0.12 * flagAmount;
  const leftFootY = hipCenterY + 0.18 + 0.05 * flagAmount;
  const rightFootX = hipCenterX + 0.06;
  const rightFootY = hipCenterY + 0.22;

  const jitter = (amp: number) => (rand() - 0.5) * amp;

  const kp = (x: number, y: number, c = 0.9): Keypoint2D => ({
    x: clamp01(x + jitter(0.004)),
    y: clamp01(y + jitter(0.004)),
    confidence: c,
  });

  // Build fixed-order array matching JOINT_NAMES.
  const out: Keypoint2D[] = new Array(JOINT_NAMES.length);
  out[0] = kp(hipCenterX, headY); // nose
  out[1] = kp(hipCenterX - 0.02, headY - 0.01); // left_eye
  out[2] = kp(hipCenterX + 0.02, headY - 0.01); // right_eye
  out[3] = kp(hipCenterX - 0.03, headY); // left_ear
  out[4] = kp(hipCenterX + 0.03, headY); // right_ear
  out[5] = kp(hipCenterX - 0.09, shoulderY); // left_shoulder
  out[6] = kp(hipCenterX + 0.09, shoulderY); // right_shoulder
  // Elbows sit between shoulder and wrist with a slight bend into the wall.
  out[7] = kp((hipCenterX - 0.09 + leftHandX) / 2 - 0.02, (shoulderY + leftHandY) / 2);
  out[8] = kp((hipCenterX + 0.09 + rightHandX) / 2 + 0.02, (shoulderY + rightHandY) / 2);
  out[9] = kp(leftHandX, leftHandY); // left_wrist
  out[10] = kp(rightHandX, rightHandY); // right_wrist
  out[11] = kp(hipCenterX - 0.05, hipCenterY); // left_hip
  out[12] = kp(hipCenterX + 0.05, hipCenterY); // right_hip
  out[13] = kp((hipCenterX - 0.05 + leftFootX) / 2, (hipCenterY + leftFootY) / 2);
  out[14] = kp((hipCenterX + 0.05 + rightFootX) / 2, (hipCenterY + rightFootY) / 2);
  out[15] = kp(leftFootX, leftFootY); // left_ankle
  out[16] = kp(rightFootX, rightFootY); // right_ankle
  return out;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function bell(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z);
}
