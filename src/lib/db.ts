// Owns the SQLite handle and the transaction wrapper. Nothing else opens the
// DB file. Every write path in this project goes through `transaction()`.
import Database from "better-sqlite3";
import path from "node:path";

const dbFile = path.join(process.cwd(), "data", "creatordesk.sqlite");

// Next.js hot-reloads server modules; keep a single handle in dev.
const globalForDb = globalThis as unknown as { __cdb?: Database.Database };
const db = globalForDb.__cdb ?? new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
if (process.env.NODE_ENV !== "production") globalForDb.__cdb = db;

export type Row = Record<string, unknown>;

export function query<T = Row>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []) {
  const info = db.prepare(sql).run(...params);
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
}

export type Tx = {
  query: typeof query;
  get: typeof get;
  run: typeof run;
};

export function transaction<T>(fn: (tx: Tx) => T): T {
  const tx: Tx = { query, get, run };
  return db.transaction(() => fn(tx))();
}
