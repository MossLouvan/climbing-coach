import type { FrameIndex, HoldId, Milliseconds } from './common';

/**
 * Movement phases recognized by the analysis pipeline.
 *
 * These phases are detected by inspecting kinematics and proximity to
 * tagged holds — see `src/domain/phases/` for the segmentation logic.
 */
export type PhaseKind =
  | 'setup' // climber is settled, low motion
  | 'weight_shift' // CoM moving over support but no hand/foot release
  | 'reach' // a hand extends toward the next hold
  | 'dyno' // ballistic / both feet or both hands momentarily off
  | 'match' // two limbs on the same hold
  | 'flag' // counterbalance foot held out of contact
  | 'rest'; // prolonged low-motion, typically on jug

export interface MovementPhase {
  readonly kind: PhaseKind;
  readonly startFrame: FrameIndex;
  readonly endFrame: FrameIndex;
  readonly startMs: Milliseconds;
  readonly endMs: Milliseconds;
  /** Holds considered "active support" during this phase (feet mostly). */
  readonly supportingHoldIds: ReadonlyArray<HoldId>;
  /** Holds this phase is trying to reach / target. */
  readonly targetHoldIds: ReadonlyArray<HoldId>;
}
