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

export function isClimbingPoseAvailable(): boolean;

export function detectPosesInVideo(
  videoUri: string,
  targetFps: number,
  maxFrames?: number | null,
): Promise<NativePoseResult>;
