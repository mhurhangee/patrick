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
		description: "Who the AI is assisting, from the user's profile.",
		surfaces: ["agentpat", "draftpat", "notepat", "extractpat"],
		wrapper: "# Attorney\nYou are assisting {who}.",
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
	EXISTINGEXTRACTIONS: {
		kind: "context",
		label: "Existing extractions",
		description: "Sources already extracted by ExtractPat, as a readable list.",
		surfaces: ["agentpat"],
		wrapper:
			"# Existing Extractions\nThese sources have already been extracted by ExtractPat. The structured result is saved as JSON — read it with the readFile tool (it is far cheaper than re-reading the PDF). Do NOT propose extractSource for a source listed here; only offer it for sources that are NOT yet extracted.\n{list}",
	},
	EXCLUDED: {
		kind: "context",
		label: "Excluded documents",
		description: 'Files the attorney marked "do not read".',
		surfaces: ["agentpat"],
		wrapper:
			"# Excluded Documents\nThe attorney has marked these documents as do-not-read. Do NOT read them (readFile is blocked), do NOT propose extracting from them, and do NOT rely on them in your response:\n{list}",
	},

	// ─── Source scope ─────────────────────────────────────────────────────────────
	OPENSOURCES: {
		kind: "scope",
		label: "Open sources",
		description: "Every source currently open in a tab (in AI context).",
		surfaces: ["agentpat"],
		wrapper:
			"# Open Documents\n\nThe following files are currently in context:\n{list}",
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
	READFILE: {
		kind: "tool",
		label: "readFile",
		description:
			"Read the text content of a file in the task folder (use for .txt, .md, .json, .docx — not PDFs, those are injected as file parts)",
		surfaces: ["agentpat"],
		wrapper:
			"- `readFile` — read a text file in the task folder (.txt/.md/.json/.docx). PDFs are already attached; don't read those.",
	},
	LISTDIRECTORY: {
		kind: "tool",
		label: "listDirectory",
		description: "List files and folders inside a directory in the task folder",
		surfaces: ["agentpat"],
		wrapper: "- `listDirectory` — browse the files/folders in the task folder.",
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
