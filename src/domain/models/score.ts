import type { FrameIndex } from './common';
import type { PhaseKind } from './phase';

/**
 * Named sub-scores produced by the coaching engine. Each is 0..100.
 * Keep this list intentionally short and interpretable.
 */
export const SCORE_CATEGORIES = [
  'balance', // CoM over support polygon
  'hip_positioning', // hip proximity to wall / under active hold
  'flagging', // uses counter-balance when geometry calls for it
  'reach_efficiency', // reaches without overextending / wasted motion
  'stability', // low unnecessary sway on static moves
  'dynamic_control', // controlled landings on dynamic moves
  'smoothness', // jerk-minimized joint trajectories
  'route_adherence', // follows tagged sequence
  // Climber-specific expansions:
  'hip_to_wall_distance', // hips pulled in to the wall vs bird-caged out
  'overgripping', // lingering hand contact / wrist jitter while weighted
  'hesitation', // pauses at a handhold before committing to the next move
  'unnecessary_foot_cuts', // feet coming off the wall outside dyno phases
  'commitment_on_dynos', // peak CoM velocity per reach distance on dynos
] as const;

export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

/** 0..100 bounded by convention. */
export type Score = number;

export interface CoachingTip {
  readonly category: ScoreCategory | 'general';
  readonly severity: 'info' | 'suggestion' | 'warning';
  readonly message: string;
  /** Optional frame to jump the user to when they tap the tip. */
  readonly focusFrame?: FrameIndex;
}

export interface PhaseScore {
  readonly phaseIndex: number;
  readonly kind: PhaseKind;
  readonly overall: Score;
  readonly byCategory: Readonly<Partial<Record<ScoreCategory, Score>>>;
  readonly tips: ReadonlyArray<CoachingTip>;
}

export interface TechniqueReport {
  readonly overall: Score;
  readonly byCategory: Readonly<Record<ScoreCategory, Score>>;
  readonly phaseScores: ReadonlyArray<PhaseScore>;
  readonly tips: ReadonlyArray<CoachingTip>;
  /**
   * Notes about limitations that affected this report (e.g.
   * "Low pose confidence on frames 120-145").
   */
  readonly caveats: ReadonlyArray<string>;
  /** Timestamp of when the report was generated. */
  readonly generatedAtMs: number;
}
