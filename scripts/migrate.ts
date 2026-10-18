// Applies migrations/*.sql in lexicographic order against data/creatordesk.sqlite.
// Idempotent only in the sense that migrations are expected to run once on a
// fresh DB; see README for the "delete data/ and re-migrate" workflow.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = path.resolve(process.cwd());
const dataDir = path.join(root, "data");
const migrationsDir = path.join(root, "migrations");
const dbFile = path.join(dataDir, "creatordesk.sqlite");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`);

const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const applied = db.prepare(`SELECT 1 FROM _migrations WHERE name = ?`).get(f);
  if (applied) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.prepare(`INSERT INTO _migrations(name) VALUES (?)`).run(f);
    db.exec("COMMIT");
    console.log(`applied ${f}`);
  } catch (e) {
    db.exec("ROLLBACK");
    console.error(`failed ${f}:`, e);
    process.exit(1);
  }
}
db.close();
console.log("migrations up to date");
