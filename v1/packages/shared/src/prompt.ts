// The prompt token catalog — static data the prompt builder runs on. Tokens are
// written <LIKE_THIS> in a template and filled at runtime from the active task.
// Live resolution (real values) comes later with the context engine; for now the
// `placeholder` stands in so the builder's preview can show where each token lands.

export type SurfaceId = "agentpat";
export type TokenKind = "context" | "scope" | "tool";

export type TokenDef = {
	/** Bare name, no brackets — e.g. "OPENDOCUMENTS". */
	name: string;
	kind: TokenKind;
	/** Short human label for the shelf. */
	label: string;
	/** What this token injects into the prompt. */
	description: string;
	/** Preview stand-in until live resolution exists. */
	placeholder: string;
	surfaces: SurfaceId[];
};

/** Matches a <TOKEN> occurrence; capture group 1 is the bare name. */
export const TOKEN_RE = /<([A-Z][A-Z0-9_]*)>/g;

export const PROMPT_TOKENS: TokenDef[] = [
	{
		name: "PRACTICECONTEXT",
		kind: "context",
		label: "Practice context",
		description:
			"Your standing instructions and house style, from this profile.",
		placeholder: "‹ your practice context ›",
		surfaces: ["agentpat"],
	},
	{
		name: "TASK",
		kind: "context",
		label: "Task",
		description: "The active task — its type, reference, and title.",
		placeholder: "‹ the active task: type · reference · title ›",
		surfaces: ["agentpat"],
	},
	{
		name: "OPENDOCUMENTS",
		kind: "scope",
		label: "Open documents",
		description: "Every open document in full — its source plus your notes.",
		placeholder: "‹ open documents — full source + notes ›",
		surfaces: ["agentpat"],
	},
	{
		name: "CLOSEDDOCUMENTS",
		kind: "scope",
		label: "Closed documents",
		description:
			"A one-line signpost for each closed document (filename, tags) — never its content.",
		placeholder: "‹ closed-document signposts — filenames + tags ›",
		surfaces: ["agentpat"],
	},
];

export const TOKENS_BY_NAME: Record<string, TokenDef> = Object.fromEntries(
	PROMPT_TOKENS.map((t) => [t.name, t]),
);

export function tokensForSurface(surface: SurfaceId): TokenDef[] {
	return PROMPT_TOKENS.filter((t) => t.surfaces.includes(surface));
}

/** Names of every <TOKEN> used in a template, in order (may repeat). */
export function tokensInTemplate(template: string): string[] {
	return [...template.matchAll(TOKEN_RE)].map((m) => m[1] as string);
}
