import { int, sqliteTable, text } from "drizzle-orm/sqlite-core"

export type ArtifactType =
	| "inventor-disclosure"
	| "office-action"
	| "patent-spec"
	| "prior-art"
	| "claims-draft"
	| "response-draft"

export type ArtifactKind = "pdf" | "draft" | "generated"

export const projects = sqliteTable("projects", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: int("updated_at", { mode: "timestamp" }).notNull(),
})

export const artifacts = sqliteTable("artifacts", {
	id: text("id").primaryKey(),
	projectId: text("project_id")
		.notNull()
		.references(() => projects.id),
	title: text("title").notNull(),
	content: text("content").notNull().default(""),
	type: text("type").$type<ArtifactType>().notNull().default("claims-draft"),
	kind: text("kind").$type<ArtifactKind>().notNull().default("draft"),
	date: text("date").notNull().default(""),
	notes: text("notes").notNull().default(""),
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: int("updated_at", { mode: "timestamp" }).notNull(),
})
