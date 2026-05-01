import { analyzeSession } from '@analysis/pipeline';
import { MockPoseProvider } from '@analysis/pose';
import {
  makeId,
  type Session,
  type SessionId,
  type Video,
  type VideoId,
} from '@domain/models';
import { applyMigrations, inMemoryDb, makeRepositories } from '@storage/index';
import { DEMO_ROUTE, DEMO_USER } from '@storage/seeds/demoRoute';
import { expectCompleted } from '../testUtils/analysis';

describe('storage repositories (inMemoryDb)', () => {
  it('round-trips a user', async () => {
    const db = inMemoryDb();
    await applyMigrations(db);
    const repos = makeRepositories(db);
    await repos.users.upsert(DEMO_USER);
    const u = await repos.users.get(DEMO_USER.id);
    expect(u).not.toBeNull();
    expect(u?.displayName).toBe(DEMO_USER.displayName);
  });

  it('round-trips a route with holds and sequence', async () => {
    const db = inMemoryDb();
    await applyMigrations(db);
    const repos = makeRepositories(db);
    await repos.routes.upsert(DEMO_ROUTE);
    const r = await repos.routes.get(DEMO_ROUTE.id);
    expect(r).not.toBeNull();
    expect(r?.holds.length).toBe(DEMO_ROUTE.holds.length);
    expect(r?.sequence.length).toBe(DEMO_ROUTE.sequence.length);
    expect(r?.grade?.system).toBe('V');
  });

  it('persists an analyzed session including pose track and report', async () => {
    const db = inMemoryDb();
    await applyMigrations(db);
    const repos = makeRepositories(db);
    await repos.users.upsert(DEMO_USER);
    await repos.routes.upsert(DEMO_ROUTE);

    const video: Video = {
      id: makeId<'Video'>('vid_ut') as VideoId,
      uri: 'stub://ut',
      durationMs: 3000,
      widthPx: 1080,
      heightPx: 1920,
      fps: 30,
    };
    const analysis = expectCompleted(
      await analyzeSession({
        video,
        route: DEMO_ROUTE,
        provider: new MockPoseProvider({ seed: 5, durationSec: 2 }),
        options: { wallDetectionEnabled: false },
      }),
    );
    const session: Session = {
      id: makeId<'Session'>('ses_ut') as SessionId,
      userId: DEMO_USER.id,
      routeId: DEMO_ROUTE.id,
      video,
      source: 'upload',
      status: 'analyzed',
      createdAtMs: Date.now(),
      phases: analysis.phases,
      poseTrack: analysis.track,
      report: analysis.report,
    };
    await repos.sessions.upsert(session);

    const read = await repos.sessions.get(session.id);
    expect(read?.report?.overall).toBe(session.report!.overall);
    expect(read?.phases?.length).toBe(session.phases!.length);
    expect(read?.poseTrack?.poses2D.length).toBe(session.poseTrack!.poses2D.length);
  });
});
