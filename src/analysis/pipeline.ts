import { trackCameraMotion } from '@analysis/holds/tracker';
import { buildAnalyticsTrack } from '@analysis/kinematics';
import { PseudoLifter } from '@analysis/lifting';
import { type PoseProvider, resolvePoseProvider } from '@analysis/pose';
import { detectTechniqueEvents } from '@analysis/technique';
import {
  detectClimbingWall,
  type WallDetectionOutcome,
} from '@analysis/wallDetector';
import { segmentPhases } from '@domain/phases';
import {
  DEFAULT_SCORING_CONFIG,
  ScoringEngine,
  type ScoringConfig,
} from '@domain/scoring';
import type {
  AnalyticsTrack,
  CameraTrack,
  MovementPhase,
  PoseTrack,
  Route,
  TechniqueEvent,
  TechniqueReport,
  Video,
} from '@domain/models';

/**
 * Orchestrates:
 *
 *   video  →  2D pose track  →  camera-motion track  →  pseudo-3D lift
 *          →  phase segmentation  →  analytics  →  technique events
 *          →  scoring  →  TechniqueReport
 *
 * The orchestrator is the ONE place that knows the dependency order
 * between pose inference, lifting, phase segmentation, and scoring.
 * Screens and stores should import this, not the individual modules,
 * so the pipeline stays pluggable end-to-end.
 */
export interface AnalysisPipelineOptions {
  readonly preferRealInference?: boolean;
  readonly climberHeightM?: number;
  readonly scoringConfig?: ScoringConfig;
  readonly targetFps?: number;
  /**
   * When true (default), the first frame is sent to a captioning model
   * and the run is aborted if the caption has no climbing-wall signal.
   * Set to false to bypass the gate (e.g. user overrides, tests).
   */
  readonly wallDetectionEnabled?: boolean;
}

export interface AnalysisOutput {
  readonly kind: 'completed';
  readonly track: PoseTrack;
  readonly phases: ReadonlyArray<MovementPhase>;
  readonly analytics: AnalyticsTrack;
  readonly techniqueEvents: ReadonlyArray<TechniqueEvent>;
  readonly report: TechniqueReport;
  readonly cameraTrack: CameraTrack;
  readonly providerName: string;
  readonly isRealInference: boolean;
  readonly wallDetection?: WallDetectionOutcome;
}

export interface AnalysisSkipped {
  readonly kind: 'skipped';
  readonly reason: 'no_climbing_wall_detected';
  readonly wallDetection: Extract<WallDetectionOutcome, { outcome: 'skip' }>;
}

export type AnalysisResult = AnalysisOutput | AnalysisSkipped;

export interface AnalysisProgress {
  readonly stage:
    | 'wall_check'
    | 'pose'
    | 'lift'
    | 'camera'
    | 'phases'
    | 'analytics'
    | 'technique'
    | 'score'
    | 'done';
  readonly framesProcessed?: number;
  readonly framesTotal?: number;
}

export async function analyzeSession(args: {
  readonly video: Video;
  readonly route: Route;
  readonly options?: AnalysisPipelineOptions;
  readonly provider?: PoseProvider;
  readonly onProgress?: (p: AnalysisProgress) => void;
  readonly detectWall?: typeof detectClimbingWall;
}): Promise<AnalysisResult> {
  const { video, route, options, onProgress } = args;
  const opts: AnalysisPipelineOptions = {
    preferRealInference: false,
    targetFps: 10,
    wallDetectionEnabled: true,
    ...options,
  };

  let wallDetection: WallDetectionOutcome | undefined;
  if (opts.wallDetectionEnabled) {
    onProgress?.({ stage: 'wall_check' });
    wallDetection = await (args.detectWall ?? detectClimbingWall)({
      videoUri: video.uri,
    });
    if (wallDetection.outcome === 'skip') {
      return {
        kind: 'skipped',
        reason: 'no_climbing_wall_detected',
        wallDetection,
      };
    }
  }

  const provider =
    args.provider ?? (await resolvePoseProvider(opts.preferRealInference ?? false));

  onProgress?.({ stage: 'pose' });
  const inference = await provider.infer(
    {
      videoUri: video.uri,
      widthPx: video.widthPx,
      heightPx: video.heightPx,
      targetFps: opts.targetFps ?? 10,
    },
    (p) => onProgress?.({ stage: 'pose', ...p }),
  );

  onProgress?.({ stage: 'camera' });
  // Derive camera-motion affine from raw 2D poses *before* lifting. We
  // want the anchors (shoulders/hips) in their native image coords, not
  // the reprojected 3D-lift versions.
  const cameraTrack = trackCameraMotion({
    fps: inference.fps,
    widthPx: inference.widthPx,
    heightPx: inference.heightPx,
    poses2D: inference.poses2D,
    poses3D: [],
    source: inference.source,
  });

  onProgress?.({ stage: 'lift' });
  const lifter = new PseudoLifter({ heightM: opts.climberHeightM });
  const track = lifter.lift({
    fps: inference.fps,
    widthPx: inference.widthPx,
    heightPx: inference.heightPx,
    poses2D: inference.poses2D,
    source: inference.source,
  });

  onProgress?.({ stage: 'phases' });
  const phases = segmentPhases(track.poses2D, route.holds, track.fps);

  onProgress?.({ stage: 'analytics' });
  // Per-frame analytics: consumed by scoring + overlays. Built after
  // phases so phase.supportingHoldIds can feed the support polygon test.
  const analytics = buildAnalyticsTrack(track, phases, route.holds);

  onProgress?.({ stage: 'technique' });
  const techniqueEvents = detectTechniqueEvents(track, phases, route.holds);

  onProgress?.({ stage: 'score' });
  const engine = new ScoringEngine(opts.scoringConfig ?? DEFAULT_SCORING_CONFIG);
  const report = engine.score({ track, phases, route, analytics });

  onProgress?.({ stage: 'done' });

  return {
    kind: 'completed',
    track,
    phases,
    analytics,
    techniqueEvents,
    report,
    cameraTrack,
    providerName: inference.providerName,
    isRealInference: inference.isRealInference,
    wallDetection,
  };
}
