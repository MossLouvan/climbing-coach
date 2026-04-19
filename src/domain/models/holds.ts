import type { HoldId, NormalizedPoint2D, RouteId } from './common';

export type HoldType =
  | 'jug'
  | 'crimp'
  | 'pinch'
  | 'sloper'
  | 'pocket'
  | 'foot_chip'
  | 'volume'
  | 'unknown';

export type HoldRole = 'start' | 'foot_only' | 'intermediate' | 'finish';

/**
 * A hold the user has tagged on a frame of their climb.
 *
 * Position is stored in *normalized image coordinates* of the reference
 * frame (usually the first frame of the video) so it's resolution-
 * independent and transferable if the camera angle is roughly fixed.
 */
export interface Hold {
  readonly id: HoldId;
  readonly routeId: RouteId;
  readonly position: NormalizedPoint2D;
  /** Approximate hold radius in normalized units; used to test reach/contact. */
  readonly radius: number;
  readonly type: HoldType;
  readonly role: HoldRole;
  /** Which hand/foot this hold is intended for, if the user specified. */
  readonly intendedLimb?: 'left_hand' | 'right_hand' | 'left_foot' | 'right_foot' | 'either';
  readonly label?: string;
}

/**
 * The climber's intended sequence through the holds on a route.
 * `holdId` values must reference holds on the same route.
 */
export interface RouteSequenceStep {
  readonly order: number;
  readonly holdId: HoldId;
  readonly limb: 'left_hand' | 'right_hand' | 'left_foot' | 'right_foot' | 'either';
  readonly note?: string;
}

export type Grade =
  | { readonly system: 'V'; readonly value: number } // V0..V17
  | { readonly system: 'YDS'; readonly value: string } // e.g. "5.10a"
  | { readonly system: 'Font'; readonly value: string } // e.g. "6A+"
  | { readonly system: 'custom'; readonly value: string };

export interface Route {
  readonly id: RouteId;
  readonly name: string;
  readonly grade?: Grade;
  readonly holds: ReadonlyArray<Hold>;
  readonly sequence: ReadonlyArray<RouteSequenceStep>;
  readonly description?: string;
}
