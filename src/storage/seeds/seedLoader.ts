import { analyzeSession } from '@analysis/pipeline';
import { MockPoseProvider } from '@analysis/pose';
import {
  makeId,
  type Session,
  type SessionId,
  type Video,
  type VideoId,
} from '@domain/models';

import type { Repositories } from '../repositories';

import { DEMO_ROUTE, DEMO_USER } from './demoRoute';

/**
 * Idempotently populate the DB with:
 *   - one demo user
 *   - one demo route (+ holds + sequence)
 *   - one demo *analyzed* session produced by running the mock pose
 *     provider through the real pipeline. This means the user sees a
 *     full technique report the first time they open the app.
 *
 * Uses a canonical video URI placeholder; actual demo asset lives in
 * `assets/demo/` and is resolved by the UI layer when the user taps
 * the video preview.
 */
export async function seedDemoData(repos: Repositories): Promise<void> {
  const existingUser = await repos.users.get(DEMO_USER.id);
  if (!existingUser) {
    await repos.users.upsert(DEMO_USER);
  }
  const existingRoute = await repos.routes.get(DEMO_ROUTE.id);
  if (!existingRoute) {
    await repos.routes.upsert(DEMO_ROUTE);
  }

  const existingSessions = await repos.sessions.listByUser(DEMO_USER.id);
  const hasDemoSession = existingSessions.some((s) => s.note === 'demo-seed');
  if (hasDemoSession) return;

  const video: Video = {
    id: makeId<'Video'>('vid_demo_v3') as VideoId,
    uri: 'asset://demo/demo_climb.mp4',
    durationMs: 6000,
    widthPx: 1080,
    heightPx: 1920,
    fps: 30,
    thumbnailUri: 'asset://demo/demo_climb_thumb.jpg',
    sizeBytes: 2_500_000,
  };

  const analysis = await analyzeSession({
    video,
    route: DEMO_ROUTE,
    provider: new MockPoseProvider({ seed: 1234 }),
    options: { preferRealInference: false, climberHeightM: 1.75 },
  });

  const session: Session = {
    id: makeId<'Session'>('ses_demo_v3') as SessionId,
    userId: DEMO_USER.id,
    routeId: DEMO_ROUTE.id,
    video,
    source: 'upload',
    status: 'analyzed',
    note: 'demo-seed',
    createdAtMs: Date.now() - 3_600_000,
    phases: analysis.phases,
    poseTrack: analysis.track,
    report: analysis.report,
  };
  await repos.sessions.upsert(session);
}
