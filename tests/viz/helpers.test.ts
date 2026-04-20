import {
  JOINT_INDEX,
  JOINT_NAMES,
  makeId,
  type FrameAnalytics,
  type HoldId,
  type Keypoint2D,
  type Pose2D,
  type TechniqueEvent,
} from '@domain/models';

import {
  TECHNIQUE_EVENT_COLORS,
  computeFadingSegments,
  computeLimbAngles,
  extractCom2D,
  extractHip2D,
  isEventActive,
  jointAngleDeg,
} from '../../src/viz/overlay2d/helpers';

// ─── fixtures ───────────────────────────────────────────────────────────────

function frame(ts: number, com: { x: number; y: number }, hip = com): FrameAnalytics {
  return {
    frame: Math.floor(ts / 33),
    timestampMs: ts,
    com2D: com,
    hip2D: hip,
    comInsideSupport: true,
    bodySwingDegPerSec: 0,
    confidence: 0.9,
  };
}

function kp(x: number, y: number, c = 0.9): Keypoint2D {
  return { x, y, confidence: c };
}

function makePose(overrides: Partial<Record<number, Keypoint2D>> = {}): Pose2D {
  const keypoints: Keypoint2D[] = JOINT_NAMES.map(() => kp(0.5, 0.5, 0.9));
  for (const [idx, v] of Object.entries(overrides)) {
    if (v) keypoints[Number(idx)] = v;
  }
  return { frame: 0, timestampMs: 0, keypoints, score: 0.9 };
}

// ─── computeFadingSegments ──────────────────────────────────────────────────

describe('computeFadingSegments', () => {
  it('returns [] when fewer than 2 points', () => {
    const out = computeFadingSegments([frame(0, { x: 0, y: 0 })], 0, 1000, extractCom2D);
    expect(out).toEqual([]);
  });

  it('returns [] when windowMs <= 0', () => {
    const pts = [frame(0, { x: 0, y: 0 }), frame(100, { x: 0.1, y: 0.1 })];
    expect(computeFadingSegments(pts, 0, 0, extractCom2D)).toEqual([]);
  });

  it('drops segments outside the window', () => {
    const pts = [
      frame(0, { x: 0, y: 0 }), // seg 0 mid=250 → dt=4850, excluded
      frame(500, { x: 0.1, y: 0.1 }), // seg 1 mid=2750 → dt=2350, included
      frame(5000, { x: 0.5, y: 0.5 }), // seg 2 mid=5100 → dt=0, included
      frame(5200, { x: 0.6, y: 0.6 }),
    ];
    // current = 5100ms, window = 3000ms.
    const out = computeFadingSegments(pts, 5100, 3000, extractCom2D);
    expect(out.length).toBe(2);
    expect(out[out.length - 1].x1).toBeCloseTo(0.5);
    expect(out[out.length - 1].x2).toBeCloseTo(0.6);
  });

  it('peaks opacity near current time and fades toward edges', () => {
    const pts = [
      frame(0, { x: 0, y: 0 }),
      frame(1000, { x: 0.1, y: 0.1 }),
      frame(2000, { x: 0.2, y: 0.2 }),
      frame(3000, { x: 0.3, y: 0.3 }),
      frame(4000, { x: 0.4, y: 0.4 }),
      frame(5000, { x: 0.5, y: 0.5 }),
    ];
    const out = computeFadingSegments(pts, 3000, 3000, extractCom2D);
    // Find the segment whose midMs is closest to 3000.
    const closest = out.reduce((best, _s, i) =>
      Math.abs(((pts[i + 1].timestampMs + pts[i].timestampMs) / 2) - 3000) <
      Math.abs(((pts[best + 1].timestampMs + pts[best].timestampMs) / 2) - 3000)
        ? i
        : best,
    0);
    const edge = out[0];
    expect(out[closest].opacity).toBeGreaterThan(edge.opacity);
    // Respect bounds.
    for (const s of out) {
      expect(s.opacity).toBeGreaterThanOrEqual(0.1);
      expect(s.opacity).toBeLessThanOrEqual(0.9);
    }
  });

  it('honours custom minOpacity / maxOpacity', () => {
    const pts = [
      frame(1000, { x: 0, y: 0 }),
      frame(2000, { x: 1, y: 1 }),
    ];
    const [seg] = computeFadingSegments(pts, 1500, 3000, extractCom2D, {
      minOpacity: 0.2,
      maxOpacity: 0.5,
    });
    expect(seg.opacity).toBeLessThanOrEqual(0.5);
    expect(seg.opacity).toBeGreaterThanOrEqual(0.2);
  });

  it('supports hip2D extractor independently of com2D', () => {
    const pts = [
      frame(0, { x: 0, y: 0 }, { x: 0.9, y: 0.1 }),
      frame(100, { x: 1, y: 1 }, { x: 0.8, y: 0.2 }),
    ];
    const com = computeFadingSegments(pts, 50, 1000, extractCom2D);
    const hip = computeFadingSegments(pts, 50, 1000, extractHip2D);
    expect(com[0].x1).toBe(0);
    expect(hip[0].x1).toBeCloseTo(0.9);
  });
});

// ─── jointAngleDeg / computeLimbAngles ──────────────────────────────────────

describe('jointAngleDeg', () => {
  it('returns 90 for a right-angle', () => {
    const a = kp(0, 0);
    const b = kp(0, 1);
    const c = kp(1, 1);
    expect(jointAngleDeg(a, b, c)).toBeCloseTo(90, 3);
  });

  it('returns 180 for a straight line', () => {
    const a = kp(0, 0);
    const b = kp(1, 0);
    const c = kp(2, 0);
    expect(jointAngleDeg(a, b, c)).toBeCloseTo(180, 3);
  });

  it('returns null when any keypoint is below threshold', () => {
    const a = kp(0, 0, 0.1);
    const b = kp(0, 1, 0.9);
    const c = kp(1, 1, 0.9);
    expect(jointAngleDeg(a, b, c, 0.5)).toBeNull();
  });

  it('returns null for degenerate segments', () => {
    const a = kp(1, 1);
    const b = kp(1, 1);
    const c = kp(2, 2);
    expect(jointAngleDeg(a, b, c)).toBeNull();
  });
});

describe('computeLimbAngles', () => {
  it('computes a 90° angle at the right elbow', () => {
    const pose = makePose({
      [JOINT_INDEX.right_shoulder]: kp(0.5, 0.4),
      [JOINT_INDEX.right_elbow]: kp(0.5, 0.5),
      [JOINT_INDEX.right_wrist]: kp(0.6, 0.5),
    });
    const angles = computeLimbAngles(pose);
    expect(angles.rightElbow).toBeCloseTo(90, 2);
  });

  it('returns null for joints below confidence', () => {
    const pose = makePose({
      [JOINT_INDEX.left_shoulder]: kp(0.5, 0.4, 0.1),
      [JOINT_INDEX.left_elbow]: kp(0.5, 0.5, 0.9),
      [JOINT_INDEX.left_wrist]: kp(0.6, 0.5, 0.9),
    });
    const angles = computeLimbAngles(pose, 0.5);
    expect(angles.leftElbow).toBeNull();
  });
});

// ─── isEventActive + color map ──────────────────────────────────────────────

describe('isEventActive', () => {
  const ev: TechniqueEvent = {
    kind: 'drop_knee',
    startFrame: 0,
    endFrame: 30,
    startMs: 1000,
    endMs: 2000,
    confidence: 0.9,
    evidence: 'test',
    relatedHoldIds: [makeId<'Hold'>('h1') as HoldId],
  };

  it('is active within [startMs, endMs]', () => {
    expect(isEventActive(ev, 1000)).toBe(true);
    expect(isEventActive(ev, 1500)).toBe(true);
    expect(isEventActive(ev, 2000)).toBe(true);
  });

  it('is inactive outside the window', () => {
    expect(isEventActive(ev, 999)).toBe(false);
    expect(isEventActive(ev, 2001)).toBe(false);
  });
});

describe('TECHNIQUE_EVENT_COLORS', () => {
  it('defines a color for every TechniqueEventKind', () => {
    const kinds: ReadonlyArray<TechniqueEvent['kind']> = [
      'flag',
      'drop_knee',
      'backstep',
      'heel_hook',
      'toe_hook',
      'barn_door',
      'foot_cut',
      'match',
      'deadpoint',
      'dyno',
      'lockoff',
      'smear',
    ];
    for (const k of kinds) {
      expect(TECHNIQUE_EVENT_COLORS[k]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
