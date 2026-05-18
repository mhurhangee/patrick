import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "@patrickos/db"

// Strip "file:" prefix — bun:sqlite takes a plain path, not a libsql URL
const dbPath = (process.env.DATABASE_URL ?? "file:../../packages/db/local.db").replace(/^file:/, "")
const sqlite = new Database(dbPath)

sqlite.exec("PRAGMA foreign_keys = ON")
sqlite.exec("PRAGMA journal_mode = WAL")

// Inline schema init — works in compiled binary where migration files aren't available.
// When migration #2 lands, replace this with proper drizzle-kit migration tracking.
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
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
)`)

export const db = drizzle(sqlite, { schema })
