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
	data BLOB,
	metadata TEXT NOT NULL DEFAULT '{}',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
)`)
sqlite.exec(`CREATE TABLE IF NOT EXISTS settings (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL DEFAULT '',
	firm TEXT NOT NULL DEFAULT '',
	role TEXT NOT NULL DEFAULT '',
	jurisdiction TEXT NOT NULL DEFAULT '',
	ai_provider TEXT NOT NULL DEFAULT 'anthropic',
	ai_quick_model TEXT NOT NULL DEFAULT '',
	ai_detailed_model TEXT NOT NULL DEFAULT '',
	prompt_context TEXT NOT NULL DEFAULT '',
	prompt_askpat TEXT NOT NULL DEFAULT '',
	prompt_agentpat TEXT NOT NULL DEFAULT '',
	prompt_extractpat TEXT NOT NULL DEFAULT ''
)`)

export const db = drizzle(sqlite, { schema })
