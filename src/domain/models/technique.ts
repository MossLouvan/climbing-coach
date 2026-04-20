import type { Confidence, FrameIndex, HoldId } from './common';

/**
 * Discrete, named technique events detected on top of `MovementPhase`
 * segmentation. A phase describes WHAT the climber is doing (reach,
 * match, dyno, ...), while a TechniqueEvent adds specific annotations
 * ("this was a drop-knee", "the left leg flagged at t=2.1s").
 *
 * Detectors favour PRECISION over recall: they emit nothing rather
 * than guess wrong. Each event carries a short `evidence` string so
 * the UI can show the climber why the event was flagged.
 */
export type TechniqueEventKind =
  | 'flag'
  | 'drop_knee'
  | 'backstep'
  | 'heel_hook'
  | 'toe_hook'
  | 'barn_door'
  | 'foot_cut'
  | 'match'
  | 'deadpoint'
  | 'dyno'
  | 'lockoff'
  | 'smear';

export interface TechniqueEvent {
  readonly kind: TechniqueEventKind;
  readonly startFrame: FrameIndex;
  readonly endFrame: FrameIndex;
  readonly startMs: number;
  readonly endMs: number;
  readonly confidence: Confidence;
  /** One-sentence human-readable rationale for why this event fired. */
  readonly evidence: string;
  /** Limb names involved, e.g. ['left_foot'] or ['left_hand', 'right_hand']. */
  readonly involvedLimbs?: ReadonlyArray<string>;
  /** Hold ids referenced by this event, when applicable. */
  readonly relatedHoldIds?: ReadonlyArray<HoldId>;
}
