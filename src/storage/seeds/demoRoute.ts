import {
  makeId,
  type Hold,
  type HoldId,
  type Route,
  type RouteSequenceStep,
  type UserId,
  type UserProfile,
} from '@domain/models';

/**
 * A hand-authored demo route — "Demo V3: Left Traverse" — used to make
 * the app immediately explorable without requiring the user to film
 * anything first. Hold positions are in NORMALIZED image coordinates
 * that match the synthetic motion in `MockPoseProvider` (start hold
 * ~ (0.42, 0.72); target ~ (0.63, 0.30)).
 */
export const DEMO_USER_ID = makeId<'User'>('usr_demo');
export const DEMO_ROUTE_ID = makeId<'Route'>('rt_demo_v3_left_traverse');

const H = (suffix: string) => makeId<'Hold'>(`hld_${suffix}`);

const demoHolds: Hold[] = [
  {
    id: H('start_left'),
    routeId: DEMO_ROUTE_ID,
    position: { x: 0.42, y: 0.72 },
    radius: 0.04,
    type: 'jug',
    role: 'start',
    intendedLimb: 'left_hand',
    label: 'Start (L)',
  },
  {
    id: H('start_right'),
    routeId: DEMO_ROUTE_ID,
    position: { x: 0.5, y: 0.72 },
    radius: 0.04,
    type: 'jug',
    role: 'start',
    intendedLimb: 'right_hand',
    label: 'Start (R)',
  },
  {
    id: H('foot_left_low'),
    routeId: DEMO_ROUTE_ID,
    position: { x: 0.38, y: 0.92 },
    radius: 0.03,
    type: 'foot_chip',
    role: 'foot_only',
    intendedLimb: 'left_foot',
    label: 'Foot L',
  },
  {
    id: H('foot_right_low'),
    routeId: DEMO_ROUTE_ID,
    position: { x: 0.56, y: 0.92 },
    radius: 0.03,
    type: 'foot_chip',
    role: 'foot_only',
    intendedLimb: 'right_foot',
    label: 'Foot R',
  },
  {
    id: H('intermediate_crimp'),
    routeId: DEMO_ROUTE_ID,
    position: { x: 0.55, y: 0.5 },
    radius: 0.035,
    type: 'crimp',
    role: 'intermediate',
    intendedLimb: 'either',
    label: 'Crimp',
  },
  {
    id: H('target_jug'),
    routeId: DEMO_ROUTE_ID,
    position: { x: 0.63, y: 0.3 },
    radius: 0.045,
    type: 'jug',
    role: 'finish',
    intendedLimb: 'right_hand',
    label: 'Top',
  },
];

const asHoldId = (suffix: string): HoldId => makeId<'Hold'>(`hld_${suffix}`);

const demoSequence: RouteSequenceStep[] = [
  { order: 1, holdId: asHoldId('start_left'), limb: 'left_hand' },
  { order: 2, holdId: asHoldId('start_right'), limb: 'right_hand' },
  { order: 3, holdId: asHoldId('foot_left_low'), limb: 'left_foot' },
  { order: 4, holdId: asHoldId('foot_right_low'), limb: 'right_foot' },
  { order: 5, holdId: asHoldId('intermediate_crimp'), limb: 'right_hand', note: 'Bump to set up the reach' },
  { order: 6, holdId: asHoldId('target_jug'), limb: 'right_hand', note: 'Match up top' },
];

export const DEMO_ROUTE: Route = {
  id: DEMO_ROUTE_ID,
  name: 'Demo V3: Left Traverse',
  grade: { system: 'V', value: 3 },
  description:
    'Seeded demo route shipped with the app. Used by MockPoseProvider ' +
    'so the analysis pipeline has something meaningful to say before ' +
    'the user has filmed anything.',
  holds: demoHolds,
  sequence: demoSequence,
};

export const DEMO_USER: UserProfile = {
  id: DEMO_USER_ID as UserId,
  displayName: 'Demo Climber',
  level: 'intermediate',
  heightM: 1.75,
  dominantHand: 'right',
  createdAtMs: 0,
};
