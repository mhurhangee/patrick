import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "@patrickos/db"

const client = createClient({
	url: process.env.DATABASE_URL ?? "file:../../packages/db/local.db",
	...(process.env.DATABASE_AUTH_TOKEN && { authToken: process.env.DATABASE_AUTH_TOKEN }),
})

// libSQL does not enable FK enforcement by default
await client.execute("PRAGMA foreign_keys = ON")

export const db = drizzle(client, { schema })
