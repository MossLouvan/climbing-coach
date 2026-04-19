import type { Database, SqlParam } from './db';

/**
 * expo-sqlite adapter. Kept in its own file so the rest of the
 * storage layer (and all of the analysis/domain code) stays free of
 * Expo imports and remains trivially testable in Node.
 */
export async function openExpoSqliteDatabase(
  dbName = 'climbing-coach.db',
): Promise<Database> {
  // Lazy import so Jest/Node tests that never call this function don't
  // need the native module to be present.
  const mod = await import('expo-sqlite');
  const handle = mod.openDatabaseAsync
    ? await mod.openDatabaseAsync(dbName)
    : (mod as unknown as { openDatabaseSync: (n: string) => unknown }).openDatabaseSync(dbName);

  await runOnHandle(handle, 'PRAGMA foreign_keys = ON;', []);

  const db: Database = {
    async exec(sql) {
      await runOnHandle(handle, sql, []);
    },
    async run(sql, params = []) {
      await runOnHandle(handle, sql, params);
    },
    async all<R = unknown>(sql: string, params: ReadonlyArray<SqlParam> = []): Promise<R[]> {
      return allOnHandle<R>(handle, sql, params);
    },
    async get<R = unknown>(sql: string, params: ReadonlyArray<SqlParam> = []): Promise<R | null> {
      const rows = await allOnHandle<R>(handle, sql, params);
      return rows[0] ?? null;
    },
    async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
      await runOnHandle(handle, 'BEGIN', []);
      try {
        const out = await fn(db);
        await runOnHandle(handle, 'COMMIT', []);
        return out;
      } catch (err) {
        await runOnHandle(handle, 'ROLLBACK', []);
        throw err;
      }
    },
    async close() {
      const h = handle as { closeAsync?: () => Promise<void>; closeSync?: () => void };
      if (h.closeAsync) await h.closeAsync();
      else h.closeSync?.();
    },
  };
  return db;
}

/**
 * expo-sqlite's newest API uses `runAsync/getAllAsync/execAsync` on
 * the handle. The older sync surface is `transaction/executeSql`.
 * This shim handles both so the rest of the code doesn't care.
 */
async function runOnHandle(
  handle: unknown,
  sql: string,
  params: ReadonlyArray<SqlParam>,
): Promise<void> {
  const h = handle as {
    runAsync?: (sql: string, params: ReadonlyArray<SqlParam>) => Promise<unknown>;
    execAsync?: (sql: string) => Promise<unknown>;
  };
  if (h.runAsync) {
    await h.runAsync(sql, params);
    return;
  }
  if (h.execAsync) {
    await h.execAsync(sql);
    return;
  }
  throw new Error('expo-sqlite handle is missing runAsync/execAsync');
}

async function allOnHandle<R>(
  handle: unknown,
  sql: string,
  params: ReadonlyArray<SqlParam>,
): Promise<R[]> {
  const h = handle as {
    getAllAsync?: (sql: string, params: ReadonlyArray<SqlParam>) => Promise<R[]>;
  };
  if (h.getAllAsync) return h.getAllAsync(sql, params);
  throw new Error('expo-sqlite handle does not support getAllAsync');
}
