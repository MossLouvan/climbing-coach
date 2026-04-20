import type {
  Hold,
  MovementPhase,
  PoseTrack,
  Route,
  RouteId,
  RouteSequenceStep,
  Session,
  SessionId,
  SessionStatus,
  TechniqueEvent,
  TechniqueReport,
  UserId,
  UserProfile,
  Video,
  VideoId,
} from '@domain/models';

import type { Database } from './db';

/**
 * Repository pattern: domain-oriented operations keyed off the
 * `Database` abstraction. Screens and stores call these, never raw SQL.
 */

export class UserRepository {
  constructor(private readonly db: Database) {}
  async upsert(user: UserProfile): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO users (id, display_name, level, height_m, dominant_hand, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)',
      [
        user.id,
        user.displayName,
        user.level,
        user.heightM ?? null,
        user.dominantHand,
        user.createdAtMs,
      ],
    );
  }
  async get(id: UserId): Promise<UserProfile | null> {
    const row = await this.db.get('SELECT * FROM users WHERE id = ?', [id]);
    return row ? this.fromRow(row) : null;
  }
  async primary(): Promise<UserProfile | null> {
    const row = await this.db.get('SELECT * FROM users ORDER BY created_at_ms LIMIT 1');
    return row ? this.fromRow(row) : null;
  }
  private fromRow(row: Record<string, unknown>): UserProfile {
    return {
      id: row.id as UserId,
      displayName: String(row.display_name),
      level: row.level as UserProfile['level'],
      heightM: (row.height_m as number | null) ?? undefined,
      dominantHand: row.dominant_hand as 'left' | 'right',
      createdAtMs: Number(row.created_at_ms),
    };
  }
}

export class RouteRepository {
  constructor(private readonly db: Database) {}
  async upsert(route: Route): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO routes (id, name, grade_system, grade_value, description, holds_json, sequence_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        route.id,
        route.name,
        route.grade?.system ?? null,
        route.grade ? String(route.grade.value) : null,
        route.description ?? null,
        JSON.stringify(route.holds),
        JSON.stringify(route.sequence),
        Date.now(),
      ],
    );
  }
  async get(id: RouteId): Promise<Route | null> {
    const row = await this.db.get('SELECT * FROM routes WHERE id = ?', [id]);
    return row ? this.fromRow(row) : null;
  }
  async list(): Promise<Route[]> {
    const rows = await this.db.all('SELECT * FROM routes ORDER BY created_at_ms DESC');
    return rows.map((r) => this.fromRow(r));
  }
  private fromRow(row: Record<string, unknown>): Route {
    const holds = JSON.parse(String(row.holds_json)) as Hold[];
    const sequence = JSON.parse(String(row.sequence_json)) as RouteSequenceStep[];
    const gradeSystem = (row.grade_system as string | null) ?? undefined;
    const gradeValue = (row.grade_value as string | null) ?? undefined;
    return {
      id: row.id as RouteId,
      name: String(row.name),
      grade: gradeSystem && gradeValue
        ? gradeSystem === 'V'
          ? { system: 'V', value: Number(gradeValue) }
          : gradeSystem === 'YDS'
            ? { system: 'YDS', value: gradeValue }
            : gradeSystem === 'Font'
              ? { system: 'Font', value: gradeValue }
              : { system: 'custom', value: gradeValue }
        : undefined,
      description: (row.description as string | null) ?? undefined,
      holds,
      sequence,
    };
  }
}

export class VideoRepository {
  constructor(private readonly db: Database) {}
  async upsert(v: Video): Promise<void> {
    await this.db.run(
      'INSERT OR REPLACE INTO videos (id, uri, duration_ms, width_px, height_px, fps, thumbnail_uri, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        v.id,
        v.uri,
        v.durationMs,
        v.widthPx,
        v.heightPx,
        v.fps,
        v.thumbnailUri ?? null,
        v.sizeBytes ?? null,
      ],
    );
  }
  async get(id: VideoId): Promise<Video | null> {
    const row = await this.db.get('SELECT * FROM videos WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id as VideoId,
      uri: String(row.uri),
      durationMs: Number(row.duration_ms),
      widthPx: Number(row.width_px),
      heightPx: Number(row.height_px),
      fps: Number(row.fps),
      thumbnailUri: (row.thumbnail_uri as string | null) ?? undefined,
      sizeBytes: (row.size_bytes as number | null) ?? undefined,
    };
  }
}

export class SessionRepository {
  constructor(
    private readonly db: Database,
    private readonly videos: VideoRepository,
    private readonly routes: RouteRepository,
  ) {}

  async upsert(session: Session): Promise<void> {
    await this.db.transaction(async (tx) => {
      await new VideoRepository(tx).upsert(session.video);
      await tx.run(
        'INSERT OR REPLACE INTO sessions (id, user_id, route_id, video_id, source, status, note, phases_json, pose_track_json, report_json, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          session.id,
          session.userId,
          session.routeId,
          session.video.id,
          session.source,
          session.status,
          session.note ?? null,
          encodePhasesBlob(session.phases, session.techniqueEvents),
          session.poseTrack ? JSON.stringify(session.poseTrack) : null,
          session.report ? JSON.stringify(session.report) : null,
          session.createdAtMs,
          Date.now(),
        ],
      );
    });
  }

  async updateStatus(id: SessionId, status: SessionStatus): Promise<void> {
    await this.db.run(
      'UPDATE sessions SET status = ?, updated_at_ms = ? WHERE id = ?',
      [status, Date.now(), id],
    );
  }

  async attachAnalysis(
    id: SessionId,
    args: {
      readonly phases: ReadonlyArray<MovementPhase>;
      readonly poseTrack: PoseTrack;
      readonly report: TechniqueReport;
      readonly techniqueEvents?: ReadonlyArray<TechniqueEvent>;
    },
  ): Promise<void> {
    await this.db.run(
      'UPDATE sessions SET phases_json = ?, pose_track_json = ?, report_json = ?, status = ?, updated_at_ms = ? WHERE id = ?',
      [
        encodePhasesBlob(args.phases, args.techniqueEvents) ?? '[]',
        JSON.stringify(args.poseTrack),
        JSON.stringify(args.report),
        'analyzed' satisfies SessionStatus,
        Date.now(),
        id,
      ],
    );
  }

  async get(id: SessionId): Promise<Session | null> {
    const row = await this.db.get('SELECT * FROM sessions WHERE id = ?', [id]);
    if (!row) return null;
    return this.hydrate(row);
  }

  async listByUser(userId: UserId, limit = 50): Promise<Session[]> {
    const rows = await this.db.all(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at_ms DESC LIMIT ' + limit,
      [userId],
    );
    const out: Session[] = [];
    for (const row of rows) out.push(await this.hydrate(row));
    return out;
  }

  private async hydrate(row: Record<string, unknown>): Promise<Session> {
    const video = await this.videos.get(row.video_id as VideoId);
    const route = await this.routes.get(row.route_id as RouteId);
    if (!video) throw new Error(`session ${row.id}: missing video`);
    if (!route) throw new Error(`session ${row.id}: missing route`);
    const decoded = decodePhasesBlob(row.phases_json);
    return {
      id: row.id as SessionId,
      userId: row.user_id as UserId,
      routeId: row.route_id as RouteId,
      video,
      source: row.source as Session['source'],
      status: row.status as SessionStatus,
      note: (row.note as string | null) ?? undefined,
      phases: decoded.phases,
      techniqueEvents: decoded.techniqueEvents,
      poseTrack: row.pose_track_json ? JSON.parse(String(row.pose_track_json)) : undefined,
      report: row.report_json ? JSON.parse(String(row.report_json)) : undefined,
      createdAtMs: Number(row.created_at_ms),
    };
  }
}

/**
 * The `phases_json` column originally stored just `MovementPhase[]`.
 * To avoid a schema migration when adding TechniqueEvents, we now
 * accept EITHER the legacy bare-array shape OR a wrapper object:
 *   { phases: MovementPhase[], techniqueEvents?: TechniqueEvent[] }
 * `decodePhasesBlob` handles both so older rows keep working.
 */
function encodePhasesBlob(
  phases: ReadonlyArray<MovementPhase> | undefined,
  events: ReadonlyArray<TechniqueEvent> | undefined,
): string | null {
  if (!phases && (!events || events.length === 0)) return null;
  return JSON.stringify({
    phases: phases ?? [],
    techniqueEvents: events ?? [],
  });
}

function decodePhasesBlob(raw: unknown): {
  phases: ReadonlyArray<MovementPhase> | undefined;
  techniqueEvents: ReadonlyArray<TechniqueEvent> | undefined;
} {
  if (raw === null || raw === undefined || raw === '') {
    return { phases: undefined, techniqueEvents: undefined };
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) {
      return { phases: parsed as MovementPhase[], techniqueEvents: undefined };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        phases: Array.isArray(parsed.phases) ? parsed.phases : undefined,
        techniqueEvents: Array.isArray(parsed.techniqueEvents)
          ? parsed.techniqueEvents
          : undefined,
      };
    }
  } catch {
    // corrupt row — treat as missing
  }
  return { phases: undefined, techniqueEvents: undefined };
}

export interface Repositories {
  readonly users: UserRepository;
  readonly routes: RouteRepository;
  readonly videos: VideoRepository;
  readonly sessions: SessionRepository;
  readonly db: Database;
}

export function makeRepositories(db: Database): Repositories {
  const users = new UserRepository(db);
  const routes = new RouteRepository(db);
  const videos = new VideoRepository(db);
  const sessions = new SessionRepository(db, videos, routes);
  return { users, routes, videos, sessions, db };
}
