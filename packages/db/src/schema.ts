import { blob, int, sqliteTable, text } from "drizzle-orm/sqlite-core"

export type AssetType =
	| "inventor-disclosure"
	| "office-action"
	| "patent-spec"
	| "prior-art"
	| "claims-draft"
	| "response-draft"

export type AssetKind = "source" | "artifact"

export const projects = sqliteTable("projects", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: int("updated_at", { mode: "timestamp" }).notNull(),
})

export const assets = sqliteTable("assets", {
	id: text("id").primaryKey(),
	projectId: text("project_id")
		.notNull()
		.references(() => projects.id),
	title: text("title").notNull(),
	content: text("content").notNull().default(""),
	type: text("type").$type<AssetType>().notNull().default("claims-draft"),
	kind: text("kind").$type<AssetKind>().notNull().default("artifact"),
	date: text("date").notNull().default(""),
	notes: text("notes").notNull().default(""),
	data: blob("data"),
	metadata: text("metadata").notNull().default("{}"),
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: int("updated_at", { mode: "timestamp" }).notNull(),
})
