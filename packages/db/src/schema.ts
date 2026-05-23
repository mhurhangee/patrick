import { blob, int, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const settings = sqliteTable("settings", {
	id: text("id").primaryKey(),
	name: text("name").notNull().default(""),
	firm: text("firm").notNull().default(""),
	role: text("role").notNull().default(""),
	jurisdiction: text("jurisdiction").notNull().default(""),
	aiProvider: text("ai_provider").notNull().default("anthropic"),
	aiQuickModel: text("ai_quick_model").notNull().default(""),
	aiDetailedModel: text("ai_detailed_model").notNull().default(""),
	promptContext: text("prompt_context").notNull().default(""),
	promptAskpat: text("prompt_askpat").notNull().default(""),
	promptAgentpat: text("prompt_agentpat").notNull().default(""),
	promptExtractpat: text("prompt_extractpat").notNull().default(""),
})

export type ProjectType =
	| "office-action-response"
	| "new-application"
	| "appeal"
	| "inventor-disclosure"
	| "general"

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
	type: text("type")
		.$type<ProjectType>()
		.notNull()
		.default("office-action-response"),
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
	extractedData: text("extracted_data"),
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: int("updated_at", { mode: "timestamp" }).notNull(),
})
