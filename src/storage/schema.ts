/**
 * SQLite schema for the local-first MVP.
 *
 * Design notes:
 *  - All heavy data (pose tracks, reports) is stored as JSON blobs in
 *    TEXT columns. These are immutable per-session artifacts that are
 *    always read whole, so normalizing them into tables would buy us
 *    nothing and just complicate migrations.
 *  - Videos live on disk (expo-file-system); we only store URIs.
 *  - IDs are UUID-ish strings so clients can generate them offline and
 *    they remain stable when a future sync backend is added.
 *  - Foreign keys are enabled via `PRAGMA foreign_keys = ON` at open.
 *  - Keep tables small and entity-focused; prefer adding tables over
 *    widening existing ones.
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     version INTEGER PRIMARY KEY,
     applied_at INTEGER NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     display_name TEXT NOT NULL,
     level TEXT NOT NULL,
     height_m REAL,
     dominant_hand TEXT NOT NULL,
     created_at_ms INTEGER NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS routes (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     grade_system TEXT,
     grade_value TEXT,
     description TEXT,
     holds_json TEXT NOT NULL,
     sequence_json TEXT NOT NULL,
     created_at_ms INTEGER NOT NULL
   );`,
  `CREATE TABLE IF NOT EXISTS videos (
     id TEXT PRIMARY KEY,
     uri TEXT NOT NULL,
     duration_ms INTEGER NOT NULL,
     width_px INTEGER NOT NULL,
     height_px INTEGER NOT NULL,
     fps REAL NOT NULL,
     thumbnail_uri TEXT,
     size_bytes INTEGER
   );`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
     video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
     source TEXT NOT NULL,
     status TEXT NOT NULL,
     note TEXT,
     phases_json TEXT,
     pose_track_json TEXT,
     report_json TEXT,
     created_at_ms INTEGER NOT NULL,
     updated_at_ms INTEGER NOT NULL
   );`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_created
     ON sessions (user_id, created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_route
     ON sessions (route_id);`,
];
