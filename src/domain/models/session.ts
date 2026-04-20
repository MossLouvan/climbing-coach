import type { AnalyticsTrack } from './analytics';
import type { RouteId, SessionId, Timestamp, UserId, VideoId } from './common';
import type { MovementPhase } from './phase';
import type { PoseTrack } from './pose';
import type { TechniqueReport } from './score';

export type SessionSource = 'live_recording' | 'upload';

export type SessionStatus =
  | 'draft' // video saved, holds not yet tagged
  | 'tagged' // holds tagged, analysis not yet run
  | 'analyzing' // pose extraction / scoring in progress
  | 'analyzed' // full report available
  | 'failed';

export interface Video {
  readonly id: VideoId;
  /** expo-file-system URI or asset URI. */
  readonly uri: string;
  readonly durationMs: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly fps: number;
  readonly thumbnailUri?: string;
  readonly sizeBytes?: number;
}

export interface Session {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly routeId: RouteId;
  readonly video: Video;
  readonly source: SessionSource;
  readonly createdAtMs: Timestamp;
  readonly status: SessionStatus;
  readonly phases?: ReadonlyArray<MovementPhase>;
  readonly poseTrack?: PoseTrack;
  readonly report?: TechniqueReport;
  readonly analytics?: AnalyticsTrack;
  readonly note?: string;
}

export type ClimberLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface UserProfile {
  readonly id: UserId;
  readonly displayName: string;
  readonly level: ClimberLevel;
  /** Height in meters — used for anthropometric scaling in pseudo-3D lift. */
  readonly heightM?: number;
  readonly dominantHand: 'left' | 'right';
  readonly createdAtMs: Timestamp;
}
