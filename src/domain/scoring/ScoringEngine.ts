import {
  type AnalyticsTrack,
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
import {
  commitmentOnDynosScore,
  footCutsScore,
  hesitationScore,
  hipToWallDistanceScore,
  overgrippingScore,
} from './heuristics/index';

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
    // Existing weights — intentionally unchanged.
    balance: 1.2,
    hip_positioning: 1.0,
    flagging: 0.8,
    reach_efficiency: 1.0,
    stability: 0.7,
    dynamic_control: 0.9,
    smoothness: 0.5,
    route_adherence: 1.1,
    // Climber-specific expansions — modest default weights so they
    // influence the overall score without drowning out the originals.
    hip_to_wall_distance: 0.7,
    overgripping: 0.6,
    hesitation: 0.5,
    unnecessary_foot_cuts: 0.6,
    commitment_on_dynos: 0.5,
  },
  lowPoseConfidenceThreshold: 0.4,
};

export class ScoringEngine {
  constructor(private readonly config: ScoringConfig = DEFAULT_SCORING_CONFIG) {}

  score(args: {
    readonly track: PoseTrack;
    readonly phases: ReadonlyArray<MovementPhase>;
    readonly route: Route;
    readonly analytics?: AnalyticsTrack;
  }): TechniqueReport {
    const { track, phases, route, analytics } = args;
    const phaseScores: PhaseScore[] = phases.map((phase, idx) =>
      this.scorePhase(idx, phase, track, route, phases, analytics),
    );

    const byCategory = this.aggregateCategories(
      phaseScores,
      track,
      phases,
      route,
      analytics,
    );
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
    phases: ReadonlyArray<MovementPhase>,
    analytics: AnalyticsTrack | undefined,
  ): PhaseScore {
    const poses = track.poses2D;
    const balance = balanceScore(phase, poses, route.holds);
    const hip = hipPositioningScore(phase, poses, route.holds);
    const flag = flaggingScore(phase, poses);
    const reach = reachEfficiencyScore(phase, poses, route.holds);
    const stab = stabilityScore(phase, poses);
    const dyn = dynamicControlScore(phase, poses);

    // Climber-specific expansions.
    const hipWall = hipToWallDistanceScore({
      phase,
      track,
      analytics,
      phaseIndex: idx,
    });
    const overgrip = overgrippingScore({
      track,
      holds: route.holds,
      phase,
      analytics,
    });
    const hesitate = hesitationScore({
      track,
      holds: route.holds,
      phase,
      analytics,
    });
    const footCuts = footCutsScore({
      track,
      holds: route.holds,
      phases,
      phase,
      analytics,
    });
    const commitment = commitmentOnDynosScore({
      track,
      holds: route.holds,
      phases,
      phase,
      analytics,
    });

    const byCategory: Partial<Record<ScoreCategory, number>> = {
      balance: balance.score,
      hip_positioning: hip.score,
      flagging: flag.score,
      reach_efficiency: reach.score,
      stability: stab.score,
      dynamic_control: dyn.score,
      hip_to_wall_distance: hipWall.score,
      overgripping: overgrip.score,
      hesitation: hesitate.score,
      unnecessary_foot_cuts: footCuts.score,
      commitment_on_dynos: commitment.score,
    };
    const overall = avgBy(byCategory, this.config.categoryWeights);

    const tips: CoachingTip[] = [];
    pushIfLow(tips, 'balance', balance, phase);
    pushIfLow(tips, 'hip_positioning', hip, phase);
    pushIfLow(tips, 'flagging', flag, phase);
    pushIfLow(tips, 'reach_efficiency', reach, phase);
    pushIfLow(tips, 'stability', stab, phase);
    pushIfLow(tips, 'dynamic_control', dyn, phase);
    pushExpansionTip(tips, 'hip_to_wall_distance', hipWall, phase, idx);
    pushExpansionTip(tips, 'overgripping', overgrip, phase, idx);
    pushExpansionTip(tips, 'hesitation', hesitate, phase, idx);
    pushExpansionTip(tips, 'unnecessary_foot_cuts', footCuts, phase, idx);
    pushExpansionTip(tips, 'commitment_on_dynos', commitment, phase, idx);

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
    analytics: AnalyticsTrack | undefined,
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
    // Whole-climb fallbacks for expansions: when no phase emitted a
    // score we compute a track-wide score so the overall average isn't
    // stuck at the neutral 70 default.
    const hipWallWhole = hipToWallDistanceScore({ track, analytics }).score;
    const overgripWhole = overgrippingScore({
      track,
      holds: route.holds,
      analytics,
    }).score;
    const hesitateWhole = hesitationScore({
      track,
      holds: route.holds,
      analytics,
    }).score;
    const footCutsWhole = footCutsScore({
      track,
      holds: route.holds,
      phases,
      analytics,
    }).score;
    const commitmentWhole = commitmentOnDynosScore({
      track,
      holds: route.holds,
      phases,
      analytics,
    }).score;
    return {
      balance: avg('balance'),
      hip_positioning: avg('hip_positioning'),
      flagging: avg('flagging'),
      reach_efficiency: avg('reach_efficiency'),
      stability: avg('stability'),
      dynamic_control: avg('dynamic_control'),
      smoothness: smoothnessScore(track).score,
      route_adherence: routeAdherenceScore(phases, route, track.poses2D).score,
      hip_to_wall_distance: count['hip_to_wall_distance']
        ? avg('hip_to_wall_distance')
        : hipWallWhole,
      overgripping: count['overgripping'] ? avg('overgripping') : overgripWhole,
      hesitation: count['hesitation'] ? avg('hesitation') : hesitateWhole,
      unnecessary_foot_cuts: count['unnecessary_foot_cuts']
        ? avg('unnecessary_foot_cuts')
        : footCutsWhole,
      commitment_on_dynos: count['commitment_on_dynos']
        ? avg('commitment_on_dynos')
        : commitmentWhole,
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

/**
 * Expansion-category tips fire at < 70 (vs. 75 for the original 8) so
 * they don't drown the screen while we tune thresholds on real footage.
 * Message copy combines the rationale from the heuristic with a
 * concrete, actionable prefix.
 */
function pushExpansionTip(
  tips: CoachingTip[],
  cat: ScoreCategory,
  result: { score: number; rationale: string },
  phase: MovementPhase,
  phaseIndex: number,
): void {
  if (result.score >= 70) return;
  const severity: CoachingTip['severity'] =
    result.score < 50 ? 'warning' : 'suggestion';
  tips.push({
    category: cat,
    severity,
    message: expansionTipMessage(cat, result.rationale, phaseIndex),
    focusFrame: phase.startFrame,
  });
}

function expansionTipMessage(
  cat: ScoreCategory,
  rationale: string,
  phaseIndex: number,
): string {
  switch (cat) {
    case 'hip_to_wall_distance':
      return `${rationale} Try a drop-knee to draw the hips in on phase ${phaseIndex + 1}.`;
    case 'overgripping':
      return `${rationale} Loosen the grip between moves — relaxed hands save forearm strength.`;
    case 'hesitation':
      return `${rationale} Commit to the next move sooner; long pauses burn energy.`;
    case 'unnecessary_foot_cuts':
      return `${rationale} Keep both feet weighted on static moves — unnecessary energy cost.`;
    case 'commitment_on_dynos':
      return `${rationale} Drive harder with the hips on dynos — half-throws rarely stick.`;
    default:
      return rationale;
  }
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
    case 'hip_to_wall_distance':
      return 'Hips drifted out from the wall. Use drop-knees and flagging to draw them back in.';
    case 'overgripping':
      return 'Grip pressure stayed high between moves. Loosen up between reaches to save forearm strength.';
    case 'hesitation':
      return 'Long pauses at holds before committing. Breathe, scan, then commit — hesitation burns energy.';
    case 'unnecessary_foot_cuts':
      return 'Feet cut off the wall during static moves. Drive through the feet instead of swinging off the arms.';
    case 'commitment_on_dynos':
      return 'Dynos lacked commitment. Drive harder with the hips on the next throw — half-throws rarely stick.';
    default:
      return 'General improvement opportunity.';
  }
}
