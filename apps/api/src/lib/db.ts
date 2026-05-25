import { Database } from "bun:sqlite"
import * as schema from "@patrickos/db"
import { drizzleBunSqlite } from "@patrickos/db"

// Strip "file:" prefix — bun:sqlite takes a plain path, not a libsql URL
const dbPath = (
	process.env.DATABASE_URL ?? "file:../../packages/db/local.db"
).replace(/^file:/, "")
const sqlite = new Database(dbPath)

sqlite.exec("PRAGMA foreign_keys = ON")
sqlite.exec("PRAGMA journal_mode = WAL")

export const db = drizzleBunSqlite(sqlite, { schema })
