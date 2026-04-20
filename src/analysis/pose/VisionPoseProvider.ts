import type { Keypoint2D, Pose2D, PoseSource } from '@domain/models';

import type {
  PoseInferenceProgress,
  PoseInferenceRequest,
  PoseInferenceResult,
  PoseProvider,
} from './PoseProvider';

/**
 * Real pose inference via the local Expo module at `modules/climbing-pose`,
 * which wraps Apple's `VNDetectHumanBodyPoseRequest`.
 *
 * Runs on the oriented, already-stored video file; samples at
 * `targetFps`; returns 17 COCO-ordered keypoints per frame. Works on
 * iOS only — on other platforms the resolver falls back to the mock
 * provider.
 */
export class VisionProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisionProviderUnavailableError';
  }
}

type ClimbingPoseApi = {
  isClimbingPoseAvailable: () => boolean;
  detectPosesInVideo: (
    videoUri: string,
    targetFps: number,
    maxFrames: number | null,
  ) => Promise<{
    fps: number;
    widthPx: number;
    heightPx: number;
    poses2D: ReadonlyArray<{
      frame: number;
      timestampMs: number;
      keypoints: ReadonlyArray<{ x: number; y: number; confidence: number }>;
      score: number;
    }>;
  }>;
};

/**
 * Require the native module at call time with defensive loading. Jest
 * and non-iOS builds never reach this function (the resolver only
 * instantiates VisionPoseProvider on iOS), so a synchronous require
 * is safe here.
 */
function loadApi(): ClimbingPoseApi {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const mod = require('climbing-pose') as ClimbingPoseApi;
    if (typeof mod?.detectPosesInVideo !== 'function') {
      throw new Error('climbing-pose module did not expose detectPosesInVideo');
    }
    return mod;
  } catch (err) {
    throw new VisionProviderUnavailableError(
      `climbing-pose native module not available: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export class VisionPoseProvider implements PoseProvider {
  public readonly name = 'apple-vision';
  public readonly isRealInference = true;
  public readonly source: PoseSource = 'vision';

  async infer(
    request: PoseInferenceRequest,
    onProgress?: (p: PoseInferenceProgress) => void,
  ): Promise<PoseInferenceResult> {
    const api = loadApi();
    if (!api.isClimbingPoseAvailable()) {
      throw new VisionProviderUnavailableError(
        'climbing-pose native module loaded but ClimbingPose not registered with the runtime — was the app built with a prebuilt iOS binary?',
      );
    }

    const result = await api.detectPosesInVideo(
      request.videoUri,
      request.targetFps,
      request.maxFrames ?? null,
    );

    const poses2D: Pose2D[] = result.poses2D.map((p) => ({
      frame: p.frame,
      timestampMs: p.timestampMs,
      keypoints: p.keypoints.map<Keypoint2D>((k) => ({
        x: k.x,
        y: k.y,
        confidence: k.confidence,
      })),
      score: p.score,
    }));

    onProgress?.({ framesProcessed: poses2D.length, framesTotal: poses2D.length });

    return {
      fps: result.fps,
      widthPx: result.widthPx,
      heightPx: result.heightPx,
      poses2D,
      providerName: this.name,
      isRealInference: true,
      source: this.source,
    };
  }
}
