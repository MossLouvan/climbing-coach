export interface NativePoseKeypoint {
  readonly x: number;
  readonly y: number;
  readonly confidence: number;
}

export interface NativePose {
  readonly frame: number;
  readonly timestampMs: number;
  readonly keypoints: ReadonlyArray<NativePoseKeypoint>;
  readonly score: number;
}

export interface NativePoseResult {
  readonly fps: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly poses2D: ReadonlyArray<NativePose>;
}

// --- Apple Vision path (legacy, iOS only) ---------------------------
export function isClimbingPoseAvailable(): boolean;

export function detectPosesInVideo(
  videoUri: string,
  targetFps: number,
  maxFrames?: number | null,
): Promise<NativePoseResult>;

// --- Ultralytics YOLO-Pose path (iOS CoreML + Android TFLite) -------
//
// These entry points are only present on a prebuilt binary that was
// compiled against a version of the native module including the YOLO
// bridge AND ships a weights file under
// `modules/climbing-pose/<platform>/weights/`. When either is missing,
// `isYoloPoseAvailable()` returns false and callers must fall back.

export interface NativeYoloPoseResult extends NativePoseResult {
  /** Weights identifier, e.g. "climber-yolo11n-v1". Propagated to the session. */
  readonly modelTag: string;
}

export function isYoloPoseAvailable(): boolean;

export function detectPosesInVideoWithYolo(
  videoUri: string,
  targetFps: number,
  maxFrames?: number | null,
): Promise<NativeYoloPoseResult>;
