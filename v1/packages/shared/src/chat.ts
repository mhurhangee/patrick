// Per-exchange metadata the server attaches to each assistant message, so the
// chat UI can show what was actually sent (observability) plus usage/cost. Kept
// in shared so the API and frontend agree on the shape.

/** A read-only source pinned into a chat's context (PDF or original docx). Once
 *  pinned it stays for the life of the chat — append-only, cacheable. */
export type PinnedSource = { filename: string; kind: "pdf" | "docx" };

export type ExchangeContext = {
	/** The detailed model id that ran this turn. */
	model: string;
	/** Read-only sources pinned into context (their content rides as messages). */
	pinnedSources: PinnedSource[];
	/** The editable draft in focus (driven by the editor tools), if any. */
	activeDraft: string | null;
};

export type ExchangeUsage = {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
};

export type ExchangeMetadata = {
	context?: ExchangeContext;
	usage?: ExchangeUsage;
};

// ─── Persistence ───────────────────────────────────────────────────────────────
// A chat lives as one JSON file in <folder>/.patrick/chats/<id>.json. It carries
// its own locked instructions + pinned context, so reopening it restores the
// exact conversation state (see v1-context-model: one system per chat).

/** A stored message — UIMessage-shaped (parts/metadata kept opaque) + a time. */
export type StoredChatMessage = {
	id: string;
	role: "user" | "assistant";
	parts: unknown[];
	metadata?: unknown;
	createdAt: string;
};

export type Chat = {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	/** The locked per-chat instructions (template, with tokens). */
	systemTemplate: string;
	/** The sources pinned into this chat (append-only). */
	pinnedSources: PinnedSource[];
	messages: StoredChatMessage[];
};

/** Lightweight shape for the sidebar list. */
export type ChatSummary = {
	id: string;
	title: string;
	updatedAt: string;
	preview: string;
};

/** First line of the first user message, for the title/preview. */
export function chatTitleFrom(messages: StoredChatMessage[]): string {
	const firstUser = messages.find((m) => m.role === "user");
	const text = (firstUser?.parts as Array<{ type: string; text?: string }>)
		?.find((p) => p.type === "text" && typeof p.text === "string")
		?.text?.trim();
	if (!text) return "New chat";
	return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
