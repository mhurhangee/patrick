import { blob, int, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { AssetKind, AssetType } from "./asset-config"
import type { ProjectType } from "./project-config"

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

// --- Projects ---
export const projects = sqliteTable("projects", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	type: text("type")
		.$type<ProjectType>()
		.notNull()
		.default("us-non-final-oa-response"),
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: int("updated_at", { mode: "timestamp" }).notNull(),
})

// --- Chats ---
export const chats = sqliteTable("chats", {
	id: text("id").primaryKey(),
	projectId: text("project_id")
		.notNull()
		.references(() => projects.id),
	title: text("title").notNull(),
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: int("updated_at", { mode: "timestamp" }).notNull(),
})

export const chatMessages = sqliteTable("chat_messages", {
	id: text("id").primaryKey(),
	chatId: text("chat_id")
		.notNull()
		.references(() => chats.id),
	role: text("role", { enum: ["user", "assistant"] }).notNull(),
	parts: text("parts").notNull(), // JSON — AI SDK v6 UIMessage parts array
	metadata: text("metadata").notNull().default("{}"), // JSON — usage, etc.
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
})

// --- Assets ---
export const assets = sqliteTable("assets", {
	id: text("id").primaryKey(),
	projectId: text("project_id")
		.notNull()
		.references(() => projects.id),
	title: text("title").notNull(),
	content: text("content").notNull().default(""),
	type: text("type").$type<AssetType>().notNull().default("us-response"),
	kind: text("kind").$type<AssetKind>().notNull().default("artifact"),
	date: text("date").notNull().default(""),
	notes: text("notes").notNull().default(""),
	data: blob("data"),
	metadata: text("metadata").notNull().default("{}"),
	details: text("details"),
	createdAt: int("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: int("updated_at", { mode: "timestamp" }).notNull(),
})
