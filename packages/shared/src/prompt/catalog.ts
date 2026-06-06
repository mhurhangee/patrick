// Prompt token catalog — DATA only (no resolvers, no fs, no tools).
// Both the API (to render) and the frontend (to draw smart chips + validate)
// import this. The server-side resolvers/tool-builders live in
// apps/api/src/lib/prompt and read their human-facing text from here.
//
// Rule: every human-facing string (chip description, tool blurb, output
// wrapper) lives on the catalog entry — never inlined in a resolver. That keeps
// per-token editing (settings.promptOverrides) a purely additive change later.

export type TokenKind = "context" | "scope" | "tool"

export type SurfaceId = "agentpat" | "draftpat" | "notepat" | "extractpat"

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
		surfaces: ["agentpat", "draftpat", "notepat", "extractpat"],
		wrapper: "# Attorney\nYou are assisting:\n{body}",
	},
	PRACTICECONTEXT: {
		kind: "context",
		label: "Practice context",
		description:
			"The attorney's house style / standing instructions (shared across surfaces).",
		surfaces: ["agentpat", "draftpat", "notepat", "extractpat"],
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

	DOCTYPE: {
		kind: "context",
		label: "Document type",
		description:
			"Guidance for the kind of document open in the editor (claims, response…).",
		surfaces: ["draftpat"],
		wrapper: "# Document\n{aiContext}",
	},
	LOCATIONINSTRUCTION: {
		kind: "context",
		label: "Field locations",
		description:
			"How ExtractPat should record where on the page each field was found. Required for the locate feature.",
		surfaces: ["extractpat"],
		wrapper: `# Field Locations
Every field in the schema is an object { content, locations }. Populate:
- content: the extracted value (string, date, or array as required)
- locations: an array of { page, zone } indicating where in the document the value was found
  - page: 1-based page number
  - zone: "top" | "upper-centre" | "centre" | "lower-centre" | "bottom"
  - Return multiple entries if the content spans non-adjacent locations
  - Return an empty array if no content was found`,
	},

	// ─── Source scope (the OPEN=CONTEXT spine) ───────────────────────────────────
	OPENDOCUMENTS: {
		kind: "scope",
		label: "Open documents",
		description:
			"Each document the attorney has open, in full — the source itself (PDF file part / artifact text) plus its notes.",
		surfaces: ["agentpat"],
		wrapper:
			"# Open Documents\nThe attorney has opened these documents — this is the context they have deliberately curated for you. Treat it as your primary, authoritative material and reason over it fully. Any open PDFs are attached above as file parts.\n\n{list}",
	},
	CLOSEDDOCUMENTS: {
		kind: "scope",
		label: "Other documents",
		description:
			"Awareness-only signpost for documents that exist in the task but aren't open (filename, type, and any note) — never their content.",
		surfaces: ["agentpat"],
		wrapper:
			"# Other Documents in the Task (not open)\nThese exist in the task folder but are NOT open, so you see only a short signpost (filename, type, and any note the attorney wrote) — never their content. Use it to notice potentially relevant material and to suggest the attorney open it. Do NOT rely on a signpost as the basis for any substantive or factual claim — to use a document's content, it must be open.\n\n{list}",
	},
	CURRENTSOURCE: {
		kind: "scope",
		label: "Current source",
		description: "The single source this note is attached to.",
		surfaces: ["notepat"],
		wrapper: "# Source\nThis note is attached to {filename}.",
	},

	// ─── Tools (presence wires the tool + emits its blurb) ────────────────────────
	EXTRACTSOURCE: {
		kind: "tool",
		label: "extractSource",
		description:
			"Propose running ExtractPat on a source document to extract structured data (e.g. office action dates, claims, cited references). Use when a source has not been extracted yet and structured data would help answer the user. The user must confirm before it runs. Only US Office Actions and EP Examination Reports can currently be extracted.",
		surfaces: ["agentpat"],
		wrapper:
			"- `extractSource` — propose extracting structured data from a not-yet-extracted source; the user confirms before it runs.",
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
