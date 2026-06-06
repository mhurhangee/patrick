// File format types — shapes of everything written to disk.
// No database, no ORM. These are the canonical types for settings.yaml,
// tasks.yaml, chats/chat-{id}.json, and extractions/{filename}.json.

import type { TaskType } from "./task-config"

// Sentinel the chat route streams (via onError) when a turn exceeds the model's
// context window, so the client can show the "start a new chat" recovery UI
// instead of a generic error. Providers phrase the underlying error differently.
export const CONTEXT_OVERFLOW_MARKER = "context-window-exceeded"

// ─── Settings (settings.yaml) ────────────────────────────────────────────────

export type AiProvider = "anthropic" | "openai" | "google" | "gateway"

// Reasoning depth for AgentPat. Maps per-provider in createModel
// (anthropic effort/thinking, openai reasoningEffort, google thinkingLevel).
export type AiEffort = "low" | "medium" | "high"

export type Settings = {
	// Freeform "who you are" — injected into every AI surface via <ATTORNEY>.
	// Also the profile's label in the picker (first line). Freeform by design:
	// consistent with the rest of the prompt system, and nothing structured to
	// feel like data harvesting.
	profile: {
		about: string
	}
	ai: {
		provider: AiProvider
		model: string // detailed model (AgentPat)
		quickModel: string // quick model (AskPat, copilot, ExtractPat)
		// AgentPat reasoning controls. Quick/extract are always low-effort.
		effort: AiEffort
		showThinking: boolean // surface the model's reasoning (transparency)
		// Per-provider API keys — stored in settings.yaml, never in browser storage
		anthropicKey: string
		openaiKey: string
		googleKey: string
		gatewayKey: string
	}
	// Full, fully-exposed system-prompt templates per surface (markdown with
	// <TOKEN> markers). Empty = use the shipped DEFAULT_TEMPLATE_*. `context` is
	// the shared practice-preferences text, injected via <PRACTICECONTEXT>.
	prompts: {
		context: string
		agentpat: string
		draftpat: string
		notepat: string
	}
	integrations: {
		epoOpsKey: string
		epoOpsSecret: string
	}
}

export const DEFAULT_SETTINGS: Settings = {
	profile: { about: "" },
	ai: {
		provider: "anthropic",
		model: "",
		quickModel: "",
		effort: "medium",
		showThinking: true,
		anthropicKey: "",
		openaiKey: "",
		googleKey: "",
		gatewayKey: "",
	},
	prompts: {
		context: "",
		agentpat: "",
		draftpat: "",
		notepat: "",
	},
	integrations: { epoOpsKey: "", epoOpsSecret: "" },
}

// ─── Task registry (tasks.yaml) ──────────────────────────────────────────────

export type TaskEntry = {
	path: string
	name: string
	addedAt: string
	/** Task type (US OA response, EP Art 94(3), etc.) — primes AgentPat. */
	taskType?: TaskType
}

// ─── Chats (chats/index.json + chats/chat-{id}.json) ─────────────────────────

export type ChatIndexEntry = {
	id: string
	title: string
	createdAt: string
	updatedAt: string
	lastMessagePreview: string
	starred?: boolean
}

export type ChatMessage = {
	id: string
	role: "user" | "assistant"
	parts: unknown[] // AI SDK UIMessage parts array
	metadata: Record<string, unknown> // usage, timing, etc.
	createdAt: string
}

export type Chat = {
	id: string
	title: string
	createdAt: string
	updatedAt: string
	messages: ChatMessage[]
}

// ─── Per-file flags (meta/flags.json) ────────────────────────────────────────
// Filename-keyed flags that travel with the task folder. One file, both lists,
// covering sources + artifacts. (Previously extractions/_excluded + _starred.)

export type Flags = {
	/** Filenames flagged "do not read" — dropped from AgentPat context. */
	excluded: string[]
	/** Filenames flagged "key document" (star). */
	starred: string[]
}

export const EMPTY_FLAGS: Flags = { excluded: [], starred: [] }

// ─── Frontend API types ───────────────────────────────────────────────────────
// Bridge types used by frontend components during the file system migration.
// These will be replaced as components are rewritten.

export type ApiSettings = Settings
export type ApiTask = TaskEntry
export type ApiChat = ChatIndexEntry & {
	taskPath: string
}
export type ApiChatMessage = ChatMessage

// Represents a file in the task folder — either a source (PDF/docx) or an
// artifact (Plate draft). A source's extraction is a view within its tab, not a
// separate asset.
export type ApiAsset = {
	id: string // relative path used as stable ID
	taskId: string // task folder path
	kind: "source" | "artifact"
	title: string
	filename: string
	path: string
	type: string // AssetType tag (may be empty until extracted)
	content: string // Plate JSON for artifacts, empty for sources
	date: string
	notes: string
	metadata: Record<string, unknown>
	details: Record<string, unknown> | null
	tags: string[]
	createdAt: string
	updatedAt: string
}
