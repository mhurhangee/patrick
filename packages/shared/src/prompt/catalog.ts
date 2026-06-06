// Prompt token catalog — DATA only (no resolvers, no fs, no tools).
// Both the API (to render) and the frontend (to draw smart chips + validate)
// import this. The server-side resolvers/tool-builders live in
// apps/api/src/lib/prompt and read their human-facing text from here.
//
// Rule: every human-facing string (chip description, tool blurb, output
// wrapper) lives on the catalog entry — never inlined in a resolver. That keeps
// per-token editing (settings.promptOverrides) a purely additive change later.

export type TokenKind = "context" | "scope" | "tool"

export type SurfaceId = "agentpat" | "draftpat" | "notepat"

// One open document as sent from the client with a chat request, under
// OPEN=CONTEXT: opening a doc puts its full content in the agent's context.
// `path` is the absolute file path (also the asset id).
export type OpenDoc = {
	path: string
	kind: "source" | "artifact"
}

// Friendly labels + one-liners per kind, for grouping in the token shelf.
export const KIND_INFO: Record<TokenKind, { label: string; help: string }> = {
	context: {
		label: "Context",
		help: "Information from your task the AI can use",
	},
	scope: { label: "Sources", help: "Which source documents the AI sees" },
	tool: { label: "Tools", help: "Abilities you give the AI" },
}

export type TokenMeta = {
	kind: TokenKind
	/** Short, human-facing — shown in the chip's collapsed/inspect view. */
	label: string
	/** What this token injects, in one sentence. For tools, also the
	 *  model-facing tool() description (single source of truth). */
	description: string
	/** Which prompt surfaces may use this token (filters the @ insert menu). */
	surfaces: SurfaceId[]
	/** Output template the resolver fills with `{slot}` values. For context
	 *  tokens this is the heading + boilerplate prose; for tools it's the
	 *  system-prompt usage blurb. Resolvers supply only the dynamic slots. */
	wrapper?: string
}

// The catalog. TokenId is derived from these keys, so adding a token = adding an
// entry here (+ its resolver in the API). Only implemented tokens live here;
// the union grows as surfaces land.
export const CATALOG = {
	// ─── Context ────────────────────────────────────────────────────────────────
	ATTORNEY: {
		kind: "context",
		label: "Attorney",
		description: "Who the AI is assisting (your freeform profile / 'You').",
		surfaces: ["agentpat", "draftpat", "notepat"],
		wrapper: "# Attorney\nYou are assisting:\n{body}",
	},
	PRACTICECONTEXT: {
		kind: "context",
		label: "Practice context",
		description:
			"The attorney's house style / standing instructions (shared across surfaces).",
		surfaces: ["agentpat", "draftpat", "notepat"],
		wrapper: "# Practice Preferences\n{body}",
	},
	TASK: {
		kind: "context",
		label: "Task",
		description: "The current task folder, its path, and the task type's aim.",
		surfaces: ["agentpat"],
		wrapper: "# Task\nTask folder: {folder}\nPath: {path}{typeLines}",
	},
	EXCLUDED: {
		kind: "context",
		label: "Excluded documents",
		description: 'Files the attorney marked "do not read".',
		surfaces: ["agentpat"],
		wrapper:
			"# Excluded Documents\nThe attorney has marked these documents as do-not-read. Do NOT read them (readFile is blocked), do NOT propose extracting from them, and do NOT rely on them in your response:\n{list}",
	},

	// ─── Source scope (the OPEN=CONTEXT spine) ───────────────────────────────────
	OPENDOCUMENTS: {
		kind: "scope",
		label: "Open documents",
		description:
			"Each document the attorney has open, in full — the source itself (PDF file part / artifact text) plus its signpost and notes.",
		surfaces: ["agentpat"],
		wrapper:
			"# Open Documents\nThe attorney has opened these documents — this is the context they have deliberately curated for you. Treat it as your primary, authoritative material and reason over it fully. Any open PDFs are attached as file parts on the most recent message — they're attached once, to the latest turn, to save tokens, so they may not appear alongside earlier turns; your earlier responses were grounded in the documents open at the time, so trust them.\n\n{list}",
	},
	CLOSEDDOCUMENTS: {
		kind: "scope",
		label: "Other documents",
		description:
			"Awareness-only signpost for documents that exist in the task but aren't open (filename, type, and a one-line signpost) — never their content.",
		surfaces: ["agentpat"],
		wrapper:
			"# Other Documents in the Task (not open)\nThese exist in the task folder but are NOT open, so you see only a short signpost (filename, type, and a one-line note of what it is) — never their content. Use it to notice potentially relevant material and to suggest the attorney open it. Do NOT rely on a signpost as the basis for any substantive or factual claim — to use a document's content, it must be open.\n\n{list}",
	},
	CURRENTSOURCE: {
		kind: "scope",
		label: "Current source",
		description: "The single source this note is attached to.",
		surfaces: ["notepat"],
		wrapper: "# Source\nThis note is attached to {filename}.",
	},

	// ─── Tools (presence wires the tool + emits its blurb) ────────────────────────
	SUGGESTSIGNPOST: {
		kind: "tool",
		label: "suggestSignpost",
		description:
			"Propose a one-line signpost (what a document is, in a sentence) for a source — especially a closed one with no signpost yet, or an open one you've now read — so it's labelled in the Other Documents list for future turns. The attorney accepts or rejects; on accept it's saved as that source's signpost. Keep it factual and short (e.g. 'US prior-art patent, Davis, on actuator linkages').",
		surfaces: ["agentpat"],
		wrapper:
			"- `suggestSignpost` — propose a one-line signpost for a source (what the document is). The attorney accepts or rejects; on accept it's saved as the doc's signpost (shown in the Other Documents list).",
	},
	SUGGESTTAGS: {
		kind: "tool",
		label: "suggestTags",
		description:
			"Propose one or more freeform tags (short triage labels like 'prior-art', 'cited', 'independent-claims', 'superseded') for a source, to help organise the task's documents. The attorney accepts or rejects; on accept they're added to the doc's tags. Tags are awareness/triage metadata — they help you and the attorney filter, not a substitute for opening a document.",
		surfaces: ["agentpat"],
		wrapper:
			"- `suggestTags` — propose freeform triage tags for a source; the attorney accepts or rejects, and on accept they're added to the doc's tags.",
	},
	REQUESTOPENFILE: {
		kind: "tool",
		label: "requestOpenFile",
		description:
			"Propose opening a document that exists in the task but is NOT currently open, so its full content enters your context. Use when a closed document (from the Other Documents list) is needed to answer accurately — e.g. to read a cited prior-art reference or check an exact date. The attorney accepts or rejects; on accept the document is opened and attached on the next turn. Only request files that appear in the Other Documents list.",
		surfaces: ["agentpat"],
		wrapper:
			"- `requestOpenFile` — propose opening a closed document (one from the Other Documents list) so you can read its full content. The attorney accepts or rejects; on accept it is attached on your next turn. Use this instead of guessing from a signpost.",
	},
	FETCHPATENT: {
		kind: "tool",
		label: "fetchPatent",
		description:
			"Fetch structured patent data from EPO OPS by publication number (e.g. EP1234567, US9876543, WO2020123456)",
		surfaces: ["agentpat"],
		wrapper:
			"- `fetchPatent` — fetch structured patent data from EPO OPS by publication number.",
	},
} satisfies Record<string, TokenMeta>

export type TokenId = keyof typeof CATALOG

// Matches `<TOKEN>` markers in a template. Shared by render (API) and the
// editor's parse/serialize + validation (frontend).
export const TOKEN_RE = /<([A-Z][A-Z0-9_]*)>/g

export function isTokenId(name: string): name is TokenId {
	return name in CATALOG
}

export function tokensForSurface(surface: SurfaceId): TokenId[] {
	return (Object.keys(CATALOG) as TokenId[]).filter((id) =>
		(CATALOG[id].surfaces as readonly SurfaceId[]).includes(surface),
	)
}

// Fill a wrapper template's `{slot}` placeholders. Missing slots become "".
export function fill(wrapper: string, slots: Record<string, string>): string {
	return wrapper.replace(/\{(\w+)\}/g, (_, key) => slots[key] ?? "")
}
