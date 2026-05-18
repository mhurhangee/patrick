import { Database } from "bun:sqlite"
import * as schema from "@patrickos/db"
import { drizzle } from "drizzle-orm/bun-sqlite"

// Strip "file:" prefix — bun:sqlite takes a plain path, not a libsql URL
const dbPath = (
	process.env.DATABASE_URL ?? "file:../../packages/db/local.db"
).replace(/^file:/, "")
const sqlite = new Database(dbPath)

sqlite.exec("PRAGMA foreign_keys = ON")
sqlite.exec("PRAGMA journal_mode = WAL")

sqlite.exec(`CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
)`)
sqlite.exec(`CREATE TABLE IF NOT EXISTS assets (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES projects(id),
	title TEXT NOT NULL,
	content TEXT NOT NULL DEFAULT '',
	type TEXT NOT NULL DEFAULT 'claims-draft',
	kind TEXT NOT NULL DEFAULT 'artifact',
	date TEXT NOT NULL DEFAULT '',
	notes TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
)`)

export const db = drizzle(sqlite, { schema })
