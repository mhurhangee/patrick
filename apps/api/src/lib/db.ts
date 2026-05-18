import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "@patrickos/db"

// Strip "file:" prefix — bun:sqlite takes a plain path, not a libsql URL
const dbPath = (process.env.DATABASE_URL ?? "file:../../packages/db/local.db").replace(/^file:/, "")
const sqlite = new Database(dbPath)

sqlite.exec("PRAGMA foreign_keys = ON")
sqlite.exec("PRAGMA journal_mode = WAL")

// Inline schema init — works in compiled binary where migration files aren't available.
// When a proper migration system lands, replace this block.
sqlite.exec(`CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
)`)
sqlite.exec(`CREATE TABLE IF NOT EXISTS artifacts (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects(id),
	title TEXT NOT NULL,
	content TEXT NOT NULL DEFAULT '',
	type TEXT NOT NULL DEFAULT 'claims-draft',
	kind TEXT NOT NULL DEFAULT 'draft',
	date TEXT NOT NULL DEFAULT '',
	notes TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
)`)

// Migrate existing DBs — SQLite has no ADD COLUMN IF NOT EXISTS
for (const col of [
	"ALTER TABLE artifacts ADD COLUMN type TEXT NOT NULL DEFAULT 'claims-draft'",
	"ALTER TABLE artifacts ADD COLUMN kind TEXT NOT NULL DEFAULT 'draft'",
	"ALTER TABLE artifacts ADD COLUMN date TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE artifacts ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
]) {
	try { sqlite.exec(col) } catch { /* column already exists */ }
}

export const db = drizzle(sqlite, { schema })
