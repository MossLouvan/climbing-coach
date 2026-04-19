import {
  type MovementPhase,
  type PhaseScore,
  type PoseTrack,
  type Route,
  type ScoreCategory,
  type TechniqueReport,
  type CoachingTip,
} from '@domain/models';

import {
  balanceScore,
  dynamicControlScore,
  flaggingScore,
  hipPositioningScore,
  reachEfficiencyScore,
  routeAdherenceScore,
  smoothnessScore,
  stabilityScore,
} from './heuristics';

/**
 * Composes per-phase heuristics into a full TechniqueReport.
 *
 * Weights are intentional, interpretable defaults and exposed via
 * `ScoringConfig` for future tuning or user-level personalization.
 */
export interface ScoringConfig {
  readonly categoryWeights: Record<ScoreCategory, number>;
  readonly lowPoseConfidenceThreshold: number; // [0..1]
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  categoryWeights: {
    balance: 1.2,
    hip_positioning: 1.0,
    flagging: 0.8,
    reach_efficiency: 1.0,
    stability: 0.7,
    dynamic_control: 0.9,
    smoothness: 0.5,
    route_adherence: 1.1,
  },
  lowPoseConfidenceThreshold: 0.4,
};

export class ScoringEngine {
  constructor(private readonly config: ScoringConfig = DEFAULT_SCORING_CONFIG) {}

  score(args: {
    readonly track: PoseTrack;
    readonly phases: ReadonlyArray<MovementPhase>;
    readonly route: Route;
  }): TechniqueReport {
    const { track, phases, route } = args;
    const phaseScores: PhaseScore[] = phases.map((phase, idx) =>
      this.scorePhase(idx, phase, track, route),
    );

    const byCategory = this.aggregateCategories(phaseScores, track, phases, route);
    const overall = this.weightedOverall(byCategory);
    const caveats = this.collectCaveats(track);
    const globalTips = this.deriveGlobalTips(byCategory, phaseScores);

    return {
      overall,
      byCategory,
      phaseScores,
      tips: globalTips,
      caveats,
      generatedAtMs: Date.now(),
    };
  }

  private scorePhase(
    idx: number,
    phase: MovementPhase,
    track: PoseTrack,
    route: Route,
  ): PhaseScore {
    const poses = track.poses2D;
    const balance = balanceScore(phase, poses, route.holds);
    const hip = hipPositioningScore(phase, poses, route.holds);
    const flag = flaggingScore(phase, poses);
    const reach = reachEfficiencyScore(phase, poses, route.holds);
    const stab = stabilityScore(phase, poses);
    const dyn = dynamicControlScore(phase, poses);

    const byCategory: Partial<Record<ScoreCategory, number>> = {
      balance: balance.score,
      hip_positioning: hip.score,
      flagging: flag.score,
      reach_efficiency: reach.score,
      stability: stab.score,
      dynamic_control: dyn.score,
    };
    const overall = avgBy(byCategory, this.config.categoryWeights);

    const tips: CoachingTip[] = [];
    pushIfLow(tips, 'balance', balance, phase);
    pushIfLow(tips, 'hip_positioning', hip, phase);
    pushIfLow(tips, 'flagging', flag, phase);
    pushIfLow(tips, 'reach_efficiency', reach, phase);
    pushIfLow(tips, 'stability', stab, phase);
    pushIfLow(tips, 'dynamic_control', dyn, phase);

    return {
      phaseIndex: idx,
      kind: phase.kind,
      overall,
      byCategory,
      tips,
    };
  }

  private aggregateCategories(
    phaseScores: ReadonlyArray<PhaseScore>,
    track: PoseTrack,
    phases: ReadonlyArray<MovementPhase>,
    route: Route,
  ): Record<ScoreCategory, number> {
    const sum: Record<string, number> = {};
    const count: Record<string, number> = {};
    for (const ps of phaseScores) {
      for (const [cat, sc] of Object.entries(ps.byCategory)) {
        if (typeof sc !== 'number') continue;
        sum[cat] = (sum[cat] ?? 0) + sc;
        count[cat] = (count[cat] ?? 0) + 1;
      }
    }
    const avg = (cat: ScoreCategory) =>
      count[cat] ? sum[cat] / count[cat] : 70;
    return {
      balance: avg('balance'),
      hip_positioning: avg('hip_positioning'),
      flagging: avg('flagging'),
      reach_efficiency: avg('reach_efficiency'),
      stability: avg('stability'),
      dynamic_control: avg('dynamic_control'),
      smoothness: smoothnessScore(track).score,
      route_adherence: routeAdherenceScore(phases, route, track.poses2D).score,
    };
  }

  private weightedOverall(byCategory: Record<ScoreCategory, number>): number {
    const w = this.config.categoryWeights;
    let num = 0;
    let den = 0;
    for (const [cat, score] of Object.entries(byCategory) as [ScoreCategory, number][]) {
      const weight = w[cat] ?? 1;
      num += score * weight;
      den += weight;
    }
    return Math.round(num / den);
  }

  private collectCaveats(track: PoseTrack): string[] {
    const caveats: string[] = [];
    const lowConfFrames = track.poses2D.filter(
      (p) => p.score < this.config.lowPoseConfidenceThreshold,
    ).length;
    if (lowConfFrames > 0) {
      caveats.push(
        `Low pose confidence on ${lowConfFrames}/${track.poses2D.length} frames — some scores may be unreliable.`,
      );
    }
    if (track.poses3D.length > 0) {
      const meanLift =
        track.poses3D.reduce((s, p) => s + p.liftConfidence, 0) / track.poses3D.length;
      if (meanLift < 0.5) {
        caveats.push(
          'Pseudo-3D lift confidence is low (mean ' +
            meanLift.toFixed(2) +
            ') — 3D feedback is approximate.',
        );
      }
    }
    return caveats;
  }

  private deriveGlobalTips(
    byCategory: Record<ScoreCategory, number>,
    _phaseScores: ReadonlyArray<PhaseScore>,
  ): CoachingTip[] {
    const tips: CoachingTip[] = [];
    const worst = (Object.entries(byCategory) as [ScoreCategory, number][])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2);
    for (const [cat, score] of worst) {
      if (score >= 80) continue;
      tips.push({
        category: cat,
        severity: score < 60 ? 'warning' : 'suggestion',
        message: friendlyTipFor(cat, score),
      });
    }
    return tips;
  }
}

function avgBy(
  values: Partial<Record<ScoreCategory, number>>,
  weights: Record<ScoreCategory, number>,
): number {
  let num = 0;
  let den = 0;
  for (const [cat, sc] of Object.entries(values) as [ScoreCategory, number][]) {
    if (typeof sc !== 'number') continue;
    const w = weights[cat] ?? 1;
    num += sc * w;
    den += w;
  }
  return den === 0 ? 70 : Math.round(num / den);
}

function pushIfLow(
  tips: CoachingTip[],
  cat: ScoreCategory,
  result: { score: number; rationale: string },
  phase: MovementPhase,
): void {
  if (result.score >= 75) return;
  tips.push({
    category: cat,
    severity: result.score < 55 ? 'warning' : 'suggestion',
    message: result.rationale,
    focusFrame: phase.startFrame,
  });
}

function friendlyTipFor(cat: ScoreCategory, score: number): string {
  switch (cat) {
    case 'balance':
      return 'Try keeping your hips more directly over your feet — most balance deductions come from CoM drifting off the support column.';
    case 'hip_positioning':
      return 'Pull your hips closer to the wall and under the next hold before reaching — it saves the arms.';
    case 'flagging':
      return 'On off-balance reaches, flag the opposite leg out to counterbalance instead of gripping harder.';
    case 'reach_efficiency':
      return 'Reaches were taking a curved path — aim for a more direct line to the next hold.';
    case 'stability':
      return 'Your setup position had extra sway. Settle before initiating a move.';
    case 'dynamic_control':
      return 'The landing swung sideways. Commit with both hips and stick the catch.';
    case 'smoothness':
      return 'Overall motion was jerky. Slow the transitions and let the weight shift finish.';
    case 'route_adherence':
      return `You drifted off the tagged route sequence (score ${Math.round(score)}). Review the intended order.`;
    default:
      return 'General improvement opportunity.';
  }
}
