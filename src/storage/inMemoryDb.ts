import type { Database, DbRow, SqlParam } from './db';

/**
 * Extremely small in-memory SQL-ish store.
 *
 * NOT a real SQL engine. It's a purpose-built fake that supports ONLY
 * the queries this codebase actually uses. Why not better-sqlite3?
 *   - zero native deps keeps `jest` fast and CI trivial
 *   - tests only need round-trip semantics, not a full query planner
 *
 * We parse a tiny dialect:
 *   INSERT OR REPLACE INTO <t> (<cols>) VALUES (?, ?, ?)
 *   SELECT * FROM <t> WHERE col = ? [AND col = ?] [ORDER BY col DESC] [LIMIT n]
 *   UPDATE <t> SET col = ?, ... WHERE col = ?
 *   DELETE FROM <t> WHERE col = ?
 *   CREATE TABLE / CREATE INDEX / PRAGMA / BEGIN/COMMIT/ROLLBACK  → no-op
 *
 * If a query can't be parsed, `run`/`all` throw with the offending SQL
 * so tests fail loudly rather than silently corrupting state.
 */
export function inMemoryDb(): Database {
  const tables = new Map<string, DbRow[]>();

  const db: Database = {
    async exec(sql) {
      parseAndRun(tables, sql, []);
    },
    async run(sql, params = []) {
      parseAndRun(tables, sql, params);
    },
    async all<R extends DbRow = DbRow>(sql: string, params: ReadonlyArray<SqlParam> = []) {
      return parseAndRun(tables, sql, params) as R[];
    },
    async get<R extends DbRow = DbRow>(sql: string, params: ReadonlyArray<SqlParam> = []) {
      const rows = parseAndRun(tables, sql, params) as R[];
      return rows[0] ?? null;
    },
    async transaction<T>(fn) {
      // Snapshot-copy for rollback.
      const snapshot = new Map<string, DbRow[]>();
      for (const [k, v] of tables.entries()) snapshot.set(k, v.map((r) => ({ ...r })));
      try {
        return await fn(db);
      } catch (err) {
        tables.clear();
        for (const [k, v] of snapshot.entries()) tables.set(k, v);
        throw err;
      }
    },
    async close() {
      tables.clear();
    },
  };
  return db;
}

function parseAndRun(
  tables: Map<string, DbRow[]>,
  rawSql: string,
  params: ReadonlyArray<SqlParam>,
): DbRow[] {
  const sql = rawSql.trim().replace(/;\s*$/, '');
  const upper = sql.toUpperCase();

  if (
    upper.startsWith('PRAGMA') ||
    upper.startsWith('CREATE TABLE') ||
    upper.startsWith('CREATE INDEX') ||
    upper.startsWith('BEGIN') ||
    upper.startsWith('COMMIT') ||
    upper.startsWith('ROLLBACK')
  ) {
    return [];
  }

  if (upper.startsWith('INSERT')) return runInsert(tables, sql, params);
  if (upper.startsWith('SELECT')) return runSelect(tables, sql, params);
  if (upper.startsWith('UPDATE')) return runUpdate(tables, sql, params);
  if (upper.startsWith('DELETE')) return runDelete(tables, sql, params);

  throw new Error(`inMemoryDb: unsupported SQL: ${rawSql}`);
}

function runInsert(
  tables: Map<string, DbRow[]>,
  sql: string,
  params: ReadonlyArray<SqlParam>,
): DbRow[] {
  // INSERT [OR REPLACE] INTO <table> (c1, c2) VALUES (?, ?)
  const m = sql.match(/^INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!m) throw new Error(`inMemoryDb: cannot parse INSERT: ${sql}`);
  const [, table, colList] = m;
  const cols = colList.split(',').map((c) => c.trim());
  const row: Record<string, SqlParam> = {};
  cols.forEach((c, i) => {
    row[c] = params[i] ?? null;
  });
  const store = tables.get(table) ?? [];
  const pk = findPkValue(table, row);
  const replaceMode = /INSERT\s+OR\s+REPLACE/i.test(sql);
  if (pk !== null && replaceMode) {
    const idx = store.findIndex((r) => r[pkColumn(table)] === pk);
    if (idx >= 0) store.splice(idx, 1);
  }
  store.push(row);
  tables.set(table, store);
  return [];
}

function runSelect(
  tables: Map<string, DbRow[]>,
  sql: string,
  params: ReadonlyArray<SqlParam>,
): DbRow[] {
  // SELECT <cols|*> FROM <table> [WHERE clauses] [ORDER BY col (ASC|DESC)] [LIMIT n]
  const m = sql.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
  if (!m) throw new Error(`inMemoryDb: cannot parse SELECT: ${sql}`);
  const [, _cols, table, whereClause, orderCol, orderDir, limitStr] = m;
  void _cols;
  const rows = (tables.get(table) ?? []).slice();
  const filtered = whereClause ? rows.filter(matcherFor(whereClause, params)) : rows;
  if (orderCol) {
    filtered.sort((a, b) => {
      const av = a[orderCol];
      const bv = b[orderCol];
      const cmp = (av ?? 0) < (bv ?? 0) ? -1 : (av ?? 0) > (bv ?? 0) ? 1 : 0;
      return (orderDir ?? 'ASC').toUpperCase() === 'DESC' ? -cmp : cmp;
    });
  }
  if (limitStr) filtered.length = Math.min(filtered.length, Number(limitStr));
  if (/^SELECT\s+MAX\((\w+)\)/i.test(sql)) {
    const col = sql.match(/^SELECT\s+MAX\((\w+)\)/i)?.[1];
    if (!col) return [{ max: null }];
    const values = (tables.get(table) ?? [])
      .map((r) => r[col])
      .filter((v): v is number => typeof v === 'number');
    const alias = sql.match(/AS\s+(\w+)/i)?.[1] ?? 'max';
    return [{ [alias]: values.length ? Math.max(...values) : null }];
  }
  return filtered;
}

function runUpdate(
  tables: Map<string, DbRow[]>,
  sql: string,
  params: ReadonlyArray<SqlParam>,
): DbRow[] {
  const m = sql.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (!m) throw new Error(`inMemoryDb: cannot parse UPDATE: ${sql}`);
  const [, table, setClause, whereClause] = m;
  const setParts = setClause.split(',').map((c) => c.trim());
  const setCols = setParts.map((p) => p.split('=')[0].trim());
  const setParams = params.slice(0, setCols.length);
  const whereParams = params.slice(setCols.length);
  const rows = tables.get(table) ?? [];
  const match = matcherFor(whereClause, whereParams);
  for (const row of rows) {
    if (match(row)) {
      setCols.forEach((c, i) => {
        row[c] = setParams[i] ?? null;
      });
    }
  }
  return [];
}

function runDelete(
  tables: Map<string, DbRow[]>,
  sql: string,
  params: ReadonlyArray<SqlParam>,
): DbRow[] {
  const m = sql.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
  if (!m) throw new Error(`inMemoryDb: cannot parse DELETE: ${sql}`);
  const [, table, whereClause] = m;
  const rows = tables.get(table) ?? [];
  if (!whereClause) {
    tables.set(table, []);
    return [];
  }
  const match = matcherFor(whereClause, params);
  tables.set(
    table,
    rows.filter((r) => !match(r)),
  );
  return [];
}

function matcherFor(
  whereClause: string,
  params: ReadonlyArray<SqlParam>,
): (row: DbRow) => boolean {
  // Only supports   colA = ? [AND colB = ?]  — plenty for our needs.
  const conds = whereClause.split(/\s+AND\s+/i).map((c) => c.trim());
  return (row: DbRow) => {
    let pi = 0;
    for (const cond of conds) {
      const mm = cond.match(/^(\w+)\s*=\s*\?$/);
      if (!mm) throw new Error(`inMemoryDb: unsupported WHERE fragment: ${cond}`);
      const col = mm[1];
      if (row[col] !== params[pi]) return false;
      pi++;
    }
    return true;
  };
}

function pkColumn(table: string): string {
  // All our tables use `id` as the PK except schema_migrations which
  // uses `version`. Keep this map explicit.
  return table === 'schema_migrations' ? 'version' : 'id';
}

function findPkValue(table: string, row: DbRow): SqlParam | null {
  return row[pkColumn(table)] ?? null;
}
