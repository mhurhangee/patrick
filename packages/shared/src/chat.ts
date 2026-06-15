// Per-exchange metadata the server attaches to each assistant message, so the
// chat UI can show what was actually sent (observability) plus usage/cost. Kept
// in shared so the API and frontend agree on the shape.

/** A read-only source pinned into a chat's context (PDF, original docx, or plain
 *  text like retrieved prior art). Once pinned it stays for the life of the chat
 *  — append-only, cacheable. */
export type PinnedSource = { filename: string; kind: "pdf" | "docx" | "text" };

/** A document's kind from its filename: PDF, plain text (.md/.txt), else Word. */
export function docKind(filename: string): PinnedSource["kind"] {
	const lower = filename.toLowerCase();
	if (lower.endsWith(".pdf")) return "pdf";
	if (lower.endsWith(".md") || lower.endsWith(".txt")) return "text";
	return "docx";
}

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
// exact conversation state (one system prompt per chat).

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

/** Lightweight shape for the sidebar list — shows the latest exchange. */
export type ChatSummary = {
	id: string;
	updatedAt: string;
	/** Latest user message (slice). */
	lastUser: string;
	/** Latest assistant reply (slice). */
	lastAssistant: string;
};

/** Normalise a UI message into the stored shape (one writer for the on-disk
 *  schema — used by both the server's save and the client's fork). */
export function toStoredMessage(
	m: { id: string; role: string; parts: unknown[]; metadata?: unknown },
	createdAt: string = new Date().toISOString(),
): StoredChatMessage {
	return {
		id: m.id,
		role: m.role === "assistant" ? "assistant" : "user",
		parts: m.parts,
		metadata: m.metadata,
		createdAt,
	};
}

/** First line of the first user message, for the title/preview. */
export function chatTitleFrom(messages: StoredChatMessage[]): string {
	const firstUser = messages.find((m) => m.role === "user");
	const text = (firstUser?.parts as Array<{ type: string; text?: string }>)
		?.find((p) => p.type === "text" && typeof p.text === "string")
		?.text?.trim();
	if (!text) return "New chat";
	return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
