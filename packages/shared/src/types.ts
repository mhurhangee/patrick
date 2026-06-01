// File format types — shapes of everything written to disk.
// No database, no ORM. These are the canonical types for settings.yaml,
// projects.yaml, chats/chat-{id}.json, and analysis/{filename}.json.

// ─── Settings (settings.yaml) ────────────────────────────────────────────────

export type AiProvider = "anthropic" | "openai" | "google" | "gateway"

export type Settings = {
	profile: {
		name: string
		firm: string
		role: string
		jurisdiction: string
	}
	ai: {
		provider: AiProvider
		model: string      // detailed model (AgentPat)
		quickModel: string // quick model (AskPat, copilot)
		// Per-provider API keys — stored in settings.yaml, never in browser storage
		anthropicKey: string
		openaiKey: string
		googleKey: string
		gatewayKey: string
	}
	prompts: {
		context: string
		agentpat: string
		askpat: string
		extractpat: string
	}
	integrations: {
		epoOpsKey: string
		epoOpsSecret: string
	}
}

export const DEFAULT_SETTINGS: Settings = {
	profile: { name: "", firm: "", role: "", jurisdiction: "" },
	ai: {
		provider: "anthropic",
		model: "",
		quickModel: "",
		anthropicKey: "",
		openaiKey: "",
		googleKey: "",
		gatewayKey: "",
	},
	prompts: { context: "", agentpat: "", askpat: "", extractpat: "" },
	integrations: { epoOpsKey: "", epoOpsSecret: "" },
}

// ─── Project registry (projects.yaml) ────────────────────────────────────────

export type ProjectEntry = {
	path: string
	name: string
	addedAt: string
}

// ─── Chats (chats/index.json + chats/chat-{id}.json) ─────────────────────────

export type ChatIndexEntry = {
	id: string
	title: string
	createdAt: string
	updatedAt: string
	lastMessagePreview: string
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

// ─── Analysis (analysis/{filename}.json) ─────────────────────────────────────

export type FileAnalysis = {
	filename: string
	tags: string[]
	extractedAt: string
	assetType?: string
	details: Record<string, unknown>
}

// ─── Frontend API types ───────────────────────────────────────────────────────
// Bridge types used by frontend components during the file system migration.
// These will be replaced as components are rewritten.

export type ApiSettings = Settings
export type ApiProject = ProjectEntry
export type ApiChat = ChatIndexEntry & { projectPath: string; messageCount?: number }
export type ApiChatMessage = ChatMessage

// Represents a file in the matter folder — either a source (PDF/docx) or artifact (Plate draft).
export type ApiAsset = {
	id: string           // relative path used as stable ID
	projectId: string    // project folder path
	kind: "source" | "artifact"
	title: string
	filename: string
	path: string
	type: string         // AssetType tag (may be empty until extracted)
	content: string      // Plate JSON for artifacts, empty for sources
	date: string
	notes: string
	metadata: Record<string, unknown>
	details: Record<string, unknown> | null
	tags: string[]
	createdAt: string
	updatedAt: string
}
