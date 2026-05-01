import type { Keypoint2D, Pose2D, PoseSource } from '@domain/models';
// Single source of truth for the native YOLO result shape lives in the
// module's own type declarations. Importing it here avoids drift
// between the inline `ClimbingPoseYoloApi` and `index.d.ts`.
import type { NativeYoloPoseResult } from 'climbing-pose';

import type {
  PoseInferenceProgress,
  PoseInferenceRequest,
  PoseInferenceResult,
  PoseProvider,
} from './PoseProvider';

/**
 * Real pose inference via a climbing-fine-tuned Ultralytics YOLO-Pose
 * model, executed by the local Expo module at `modules/climbing-pose`.
 *
 * The native side loads a bundled CoreML (iOS) or TFLite (Android)
 * weights file, runs inference at the requested sampling rate, and
 * returns 17 COCO-ordered keypoints per frame — the same contract as
 * `VisionPoseProvider`, so callers can swap providers freely.
 *
 * Until a trained + bundled weights file ships with the app, the
 * native module's `isYoloPoseAvailable()` will return false and this
 * provider throws `YoloProviderUnavailableError` with code
 * `NOT_BUNDLED`. The resolver uses that signal to fall back to
 * `VisionPoseProvider` on iOS or `MockPoseProvider` elsewhere.
 *
 * Training + export pipeline: see `scripts/training/` and
 * `docs/yolo-pose-migration-spec.md`.
 */
export type YoloProviderUnavailableCode =
  | 'NOT_BUNDLED'
  | 'NATIVE_MODULE_MISSING'
  | 'RUNTIME_ERROR';

export class YoloProviderUnavailableError extends Error {
  public readonly code: YoloProviderUnavailableCode;
  constructor(code: YoloProviderUnavailableCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'YoloProviderUnavailableError';
  }
}

type ClimbingPoseYoloApi = {
  isYoloPoseAvailable: () => boolean;
  // Optionality of `maxFrames` mirrors `index.d.ts` exactly; the call
  // site below normalises with `?? null` before invocation.
  detectPosesInVideoWithYolo: (
    videoUri: string,
    targetFps: number,
    maxFrames?: number | null,
  ) => Promise<NativeYoloPoseResult>;
};

type ProbeApi = Pick<ClimbingPoseYoloApi, 'isYoloPoseAvailable'>;

/**
 * Defensive runtime require — the native module is only present on
 * prebuilt iOS/Android binaries. Jest (node) and Expo Go never reach
 * this function because the resolver does not instantiate this
 * provider unless the backend flag explicitly asks for YOLO.
 *
 * Two modes:
 *   - 'inference' (default) requires both `isYoloPoseAvailable` and
 *     `detectPosesInVideoWithYolo` to be functions; used by `infer()`.
 *   - 'probe' only requires `isYoloPoseAvailable`; used by the static
 *     availability probe so a partially-shipped native build (probe
 *     ready, inference not yet wired) can still report status without
 *     a false NATIVE_MODULE_MISSING.
 */
function loadYoloApi(): ClimbingPoseYoloApi;
function loadYoloApi(mode: 'inference'): ClimbingPoseYoloApi;
function loadYoloApi(mode: 'probe'): ProbeApi;
function loadYoloApi(mode: 'inference' | 'probe' = 'inference'): ClimbingPoseYoloApi | ProbeApi {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const mod = require('climbing-pose') as Partial<ClimbingPoseYoloApi>;
    if (typeof mod?.isYoloPoseAvailable !== 'function') {
      throw new YoloProviderUnavailableError(
        'NATIVE_MODULE_MISSING',
        'climbing-pose module loaded but isYoloPoseAvailable is not exported. ' +
          'Rebuild the native module against the version that includes the YOLO bridge.',
      );
    }
    if (mode === 'inference' && typeof mod?.detectPosesInVideoWithYolo !== 'function') {
      throw new YoloProviderUnavailableError(
        'NATIVE_MODULE_MISSING',
        'climbing-pose module loaded but detectPosesInVideoWithYolo is not exported. ' +
          'The YOLO inference bridge is missing from this native build.',
      );
    }
    return mod as ClimbingPoseYoloApi;
  } catch (err) {
    if (err instanceof YoloProviderUnavailableError) throw err;
    throw new YoloProviderUnavailableError(
      'NATIVE_MODULE_MISSING',
      `climbing-pose native module not available: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export class YoloPoseProvider implements PoseProvider {
  public readonly name: string;
  public readonly isRealInference = true;
  public readonly source: PoseSource = 'yolo';

  constructor(opts: { readonly modelTag?: string } = {}) {
    this.name = opts.modelTag ? `yolo:${opts.modelTag}` : 'yolo:climber-yolo11n-v1';
  }

  /**
   * Cheap availability check that does not invoke inference.
   *
   * Contract: synchronous, side-effect-free beyond the native
   * `isYoloPoseAvailable()` call, and **never throws**. Any failure
   * mode — missing native module, missing entry point, native bridge
   * raising at the JSI/TurboModule layer — is collapsed to `false`.
   * The resolver depends on this: a throw here would surface as an
   * unhandled rejection inside `tryYolo()` and crash the app at the
   * "pick a pose backend" step.
   *
   * Returns true only when the native module reports a bundled
   * weights file via `isYoloPoseAvailable() === true`.
   *
   * Note: deliberately not cached. The native side may report
   * different availability after a hot reload (dev) or after a
   * model-package install (release path with downloadable weights).
   * If profiling shows this is a hot path, add a cache with an
   * explicit invalidation hook — not a silent one.
   */
  static probeAvailability(): boolean {
    try {
      const api = loadYoloApi('probe');
      return api.isYoloPoseAvailable() === true;
    } catch {
      // Any failure — including non-YoloProviderUnavailableError types
      // such as a TurboModule dispatch error or a native exception
      // bubbling through the JSI bridge — means "not available".
      // Re-throwing here would crash the resolver.
      return false;
    }
  }

  async infer(
    request: PoseInferenceRequest,
    onProgress?: (p: PoseInferenceProgress) => void,
  ): Promise<PoseInferenceResult> {
    const api = loadYoloApi();

    if (!api.isYoloPoseAvailable()) {
      throw new YoloProviderUnavailableError(
        'NOT_BUNDLED',
        'YOLO-Pose weights are not bundled in this build. ' +
          'Train and export a model via scripts/training/, place the artifact under ' +
          'modules/climbing-pose/<platform>/weights/, and rebuild. ' +
          'Falling back to VisionPoseProvider / MockPoseProvider is handled by resolvePoseProvider().',
      );
    }

    let result: NativeYoloPoseResult;
    try {
      result = await api.detectPosesInVideoWithYolo(
        request.videoUri,
        request.targetFps,
        request.maxFrames ?? null,
      );
    } catch (err) {
      throw new YoloProviderUnavailableError(
        'RUNTIME_ERROR',
        `YOLO-Pose inference failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

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
      // `modelTag` is typed as a required string, but the iOS bridge
      // returns `""` when the bundled weights have no associated tag
      // (e.g. a dev build with hand-placed weights). Treat empty as
      // "tag absent" and fall back to the constructor default.
      providerName: result.modelTag ? `yolo:${result.modelTag}` : this.name,
      isRealInference: true,
      source: this.source,
    };
  }
}
