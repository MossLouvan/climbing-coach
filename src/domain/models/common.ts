/**
 * Shared primitive types used across the domain.
 *
 * IMPORTANT: keep these dependency-free. No React, no three, no expo.
 * This file is pure TypeScript so it can be unit-tested in Node.
 */

/** Branded string IDs so we don't mix up e.g. a holdId with a sessionId. */
export type Id<Brand extends string> = string & { readonly __brand: Brand };

export const makeId = <Brand extends string>(raw: string): Id<Brand> =>
  raw as Id<Brand>;

export type SessionId = Id<'Session'>;
export type RouteId = Id<'Route'>;
export type HoldId = Id<'Hold'>;
export type UserId = Id<'User'>;
export type VideoId = Id<'Video'>;

/** Normalized image coordinates in [0, 1], origin top-left. */
export interface NormalizedPoint2D {
  readonly x: number; // [0, 1]
  readonly y: number; // [0, 1]
}

/** Pixel coordinates (e.g. for rendering on a concrete surface). */
export interface PixelPoint2D {
  readonly x: number;
  readonly y: number;
}

/**
 * 3D point in a wall-aligned coordinate frame.
 *
 * Convention:
 *   +x — climber's right on the wall
 *   +y — up
 *   +z — away from the wall (toward camera)
 *
 * Units are meters, but only roughly so — pseudo-3D from a single camera
 * is scale-ambiguous, so treat absolute magnitudes as approximate.
 */
export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type Timestamp = number; // epoch millis
export type Milliseconds = number;
export type FrameIndex = number;

/** Confidence in [0, 1]. */
export type Confidence = number;
