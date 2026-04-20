import type { Pose2D, PoseSource } from '@domain/models';

/**
 * Abstract boundary between the UI and whatever engine actually does
 * 2D pose inference. Concrete providers:
 *
 *  - `MockPoseProvider` — plays back a pre-seeded keypoint trace.
 *      Works in Expo Go without native deps. Used for demos and tests.
 *
 *  - `TFJSPoseProvider` — runs MoveNet via `@tensorflow/tfjs-react-native`.
 *      Needs a custom Expo dev build (`expo prebuild`) and is documented
 *      as such. Swappable via `PoseProviderRegistry`.
 *
 * Keep this file dependency-free so it can be imported from tests.
 */
export interface PoseInferenceRequest {
  /** URI to the decoded video or a directory of extracted frames. */
  readonly videoUri: string;
  readonly widthPx: number;
  readonly heightPx: number;
  /**
   * Target sampling rate for pose inference. Many climbing moves happen
   * at ~10 Hz; going higher costs battery without obvious benefit for
   * coaching-level analysis.
   */
  readonly targetFps: number;
  readonly maxFrames?: number;
}

export interface PoseInferenceProgress {
  readonly framesProcessed: number;
  readonly framesTotal: number;
}

export interface PoseInferenceResult {
  readonly fps: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly poses2D: ReadonlyArray<Pose2D>;
  /** Which concrete provider produced this track. */
  readonly providerName: string;
  /**
   * True if the provider returned real inference results (i.e. not a
   * seeded demo trace). The UI uses this to badge runs as "demo".
   */
  readonly isRealInference: boolean;
  /** Canonical source tag propagated onto PoseTrack. */
  readonly source: PoseSource;
}

export interface PoseProvider {
  readonly name: string;
  readonly isRealInference: boolean;
  readonly source: PoseSource;
  infer(
    request: PoseInferenceRequest,
    onProgress?: (p: PoseInferenceProgress) => void,
  ): Promise<PoseInferenceResult>;
}
