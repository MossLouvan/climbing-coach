import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

/**
 * Thin, explicit database boundary.
 *
 * The storage layer talks to this interface — never directly to
 * `expo-sqlite`. Two concrete implementations exist:
 *
 *  - `expoSqliteDb()`  — real device/simulator via expo-sqlite
 *  - `inMemoryDb()`    — used by tests, can be provided in Node via
 *                         better-sqlite3 OR an array-backed fake.
 *                         We keep the fake dependency-free so the
 *                         project's `jest` run needs zero native deps.
 */
export type SqlParam = string | number | boolean | null;

export type DbRow = Record<string, SqlParam>;

export interface Database {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: ReadonlyArray<SqlParam>): Promise<void>;
  all<R = DbRow>(sql: string, params?: ReadonlyArray<SqlParam>): Promise<R[]>;
  get<R = DbRow>(sql: string, params?: ReadonlyArray<SqlParam>): Promise<R | null>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function applyMigrations(db: Database): Promise<void> {
  for (const stmt of SCHEMA_SQL) {
    await db.exec(stmt);
  }
  const current = await db.get<{ max: number | null }>(
    'SELECT MAX(version) as max FROM schema_migrations',
  );
  if (!current || current.max == null || current.max < SCHEMA_VERSION) {
    await db.run(
      'INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      [SCHEMA_VERSION, Date.now()],
    );
  }
}
