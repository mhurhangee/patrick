import { Database } from "bun:sqlite"
import * as schema from "@patrickos/db"
import { drizzleBunSqlite } from "@patrickos/db"
import { migrations } from "./migrations"

// Strip "file:" prefix — bun:sqlite takes a plain path, not a libsql URL
const dbPath = (
	process.env.DATABASE_URL ?? "file:../../packages/db/local.db"
).replace(/^file:/, "")
const sqlite = new Database(dbPath)

sqlite.exec("PRAGMA foreign_keys = ON")
sqlite.exec("PRAGMA journal_mode = WAL")

// Run inline migrations — idempotent, works in both dev and compiled binary
sqlite.exec(`
	CREATE TABLE IF NOT EXISTS __migrations (
		name TEXT PRIMARY KEY,
		applied_at INTEGER NOT NULL DEFAULT (unixepoch())
	)
`)
const applied = new Set(
	(sqlite.query("SELECT name FROM __migrations").all() as { name: string }[]).map(
		(r) => r.name,
	),
)
for (const { name, sql } of migrations) {
	if (!applied.has(name)) {
		sqlite.exec(sql)
		sqlite.prepare("INSERT INTO __migrations (name) VALUES (?)").run(name)
	}
}

export const db = drizzleBunSqlite(sqlite, { schema })
