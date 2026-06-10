// Per-exchange metadata the server attaches to each assistant message, so the
// chat UI can show what was actually sent (observability) plus usage/cost. Kept
// in shared so the API and frontend agree on the shape.

/** A read-only source pinned into a chat's context (PDF or original docx). Once
 *  pinned it stays for the life of the chat — append-only, cacheable. */
export type PinnedSource = { filename: string; kind: "pdf" | "docx" };

export type ExchangeContext = {
	/** The detailed model id that ran this turn. */
	model: string;
	/** The exact system prompt sent — instructions + manifest, no doc content. */
	system: string;
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
