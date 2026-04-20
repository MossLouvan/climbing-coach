import { detectContacts, type LimbContact } from '@analysis/holds/contact';
import {
  JOINT_INDEX,
  type Hold,
  type MovementPhase,
  type Pose2D,
  type PoseTrack,
  type TechniqueEvent,
  type TechniqueEventKind,
} from '@domain/models';

/**
 * Shared utilities for the per-technique detectors.
 *
 * Detectors work on the 2D pose track. Pseudo-3D is too noisy and
 * scale-ambiguous to rely on for boolean decisions like "is the
 * heel above the hold" — we prefer 2D cues with conservative
 * thresholds so we PREFER FALSE-NEGATIVES OVER FALSE-POSITIVES.
 */

/** Minimum confidence below which we don't trust a keypoint. */
export const MIN_KP_CONFIDENCE = 0.3;

/** Smallest gap (frames) before we split a run of hits into separate events. */
export const MAX_GAP_FRAMES = 2;

export interface FrameContext {
  readonly pose: Pose2D;
  readonly contacts: ReadonlyArray<LimbContact>;
  readonly fps: number;
}

/** Build one FrameContext per pose in the track. */
export function buildFrameContexts(
  track: PoseTrack,
  holds: ReadonlyArray<Hold>,
): FrameContext[] {
  return track.poses2D.map((pose) => ({
    pose,
    contacts: detectContacts(pose, holds),
    fps: track.fps,
  }));
}

/** Convert frame-count duration to milliseconds. */
export function framesToMs(frames: number, fps: number): number {
  if (!fps || fps <= 0) return 0;
  return (frames / fps) * 1000;
}

/** Frame count that corresponds to `ms` of video at the track's fps. */
export function msToFrames(ms: number, fps: number): number {
  if (!fps || fps <= 0) return 0;
  return Math.max(1, Math.ceil((ms / 1000) * fps));
}

/**
 * Collapse a boolean per-frame predicate into contiguous runs, then
 * filter by minimum length. Returns [startIdx, endIdx] pairs (inclusive).
 *
 * Small gaps (<= `maxGap`) between hits are absorbed, since real
 * pose estimation is noisy — a single-frame miss in the middle of
 * a 20-frame hit shouldn't shatter the event.
 */
export function findRuns(
  hits: ReadonlyArray<boolean>,
  minLen: number,
  maxGap: number = MAX_GAP_FRAMES,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (hits.length === 0) return out;

  let runStart = -1;
  let runEnd = -1;
  let gap = 0;
  for (let i = 0; i < hits.length; i++) {
    if (hits[i]) {
      if (runStart < 0) {
        runStart = i;
      }
      runEnd = i;
      gap = 0;
    } else if (runStart >= 0) {
      gap += 1;
      if (gap > maxGap) {
        if (runEnd - runStart + 1 >= minLen) {
          out.push([runStart, runEnd]);
        }
        runStart = -1;
        runEnd = -1;
        gap = 0;
      }
    }
  }
  if (runStart >= 0 && runEnd - runStart + 1 >= minLen) {
    out.push([runStart, runEnd]);
  }
  return out;
}

/**
 * Build a TechniqueEvent for a [startIdx, endIdx] frame-index pair
 * (positions in the track, not absolute FrameIndex numbers).
 */
export function eventFromRun(args: {
  readonly kind: TechniqueEventKind;
  readonly track: PoseTrack;
  readonly startIdx: number;
  readonly endIdx: number;
  readonly confidence: number;
  readonly evidence: string;
  readonly involvedLimbs?: ReadonlyArray<string>;
  readonly relatedHoldIds?: TechniqueEvent['relatedHoldIds'];
}): TechniqueEvent {
  const startPose = args.track.poses2D[args.startIdx];
  const endPose = args.track.poses2D[args.endIdx];
  const base: TechniqueEvent = {
    kind: args.kind,
    startFrame: startPose.frame,
    endFrame: endPose.frame,
    startMs: startPose.timestampMs,
    endMs: endPose.timestampMs,
    confidence: clamp01(args.confidence),
    evidence: args.evidence,
    ...(args.involvedLimbs ? { involvedLimbs: args.involvedLimbs } : {}),
    ...(args.relatedHoldIds ? { relatedHoldIds: args.relatedHoldIds } : {}),
  };
  return base;
}

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export interface HipAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/** Return mid-hip and approximate hip width; undefined if keypoints are missing. */
export function hipAnchor(pose: Pose2D): HipAnchor | undefined {
  const lh = pose.keypoints[JOINT_INDEX.left_hip];
  const rh = pose.keypoints[JOINT_INDEX.right_hip];
  if (!lh || !rh) return undefined;
  if (lh.confidence < MIN_KP_CONFIDENCE || rh.confidence < MIN_KP_CONFIDENCE) {
    return undefined;
  }
  return {
    x: (lh.x + rh.x) / 2,
    y: (lh.y + rh.y) / 2,
    width: Math.abs(lh.x - rh.x),
  };
}

/**
 * Merge temporally-adjacent events of the same kind (<= `maxGapMs`).
 * Keeps the first event's evidence; takes the max confidence.
 */
export function mergeAdjacent(
  events: ReadonlyArray<TechniqueEvent>,
  maxGapMs: number = 120,
): TechniqueEvent[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.startFrame - b.startFrame);
  const out: TechniqueEvent[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.kind === prev.kind && cur.startMs - prev.endMs <= maxGapMs) {
      out[out.length - 1] = {
        ...prev,
        endFrame: Math.max(prev.endFrame, cur.endFrame),
        endMs: Math.max(prev.endMs, cur.endMs),
        confidence: Math.max(prev.confidence, cur.confidence),
      };
    } else {
      out.push(cur);
    }
  }
  return out;
}

/** Return phases that overlap (inclusive) with frame index range. */
export function phasesOverlapping(
  phases: ReadonlyArray<MovementPhase>,
  startFrame: number,
  endFrame: number,
): MovementPhase[] {
  return phases.filter((p) => p.endFrame >= startFrame && p.startFrame <= endFrame);
}

/** True when the given frame index falls inside any dyno phase. */
export function isFrameInsideDyno(
  phases: ReadonlyArray<MovementPhase>,
  frame: number,
): boolean {
  return phases.some((p) => p.kind === 'dyno' && frame >= p.startFrame && frame <= p.endFrame);
}

/**
 * Produce a y-velocity sign array for the CoM (or any scalar series).
 * Returns -1, 0, +1 per frame, using a small tolerance.
 */
export function velocitySign(
  series: ReadonlyArray<number>,
  eps: number = 1e-4,
): number[] {
  const out: number[] = new Array(series.length).fill(0);
  for (let i = 1; i < series.length; i++) {
    const d = series[i] - series[i - 1];
    if (d > eps) out[i] = 1;
    else if (d < -eps) out[i] = -1;
    else out[i] = 0;
  }
  return out;
}
