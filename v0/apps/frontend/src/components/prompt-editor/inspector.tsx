import type { TokenKind } from "@patrickos/shared"

// Chip / pill colour by token kind — shared between the Source editor pills, the
// Preview chips, and the token shelf.
export const KIND_CHIP: Record<TokenKind | "unknown", string> = {
	context: "bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25",
	scope:
		"bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25",
	tool: "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25",
	unknown:
		"bg-red-500/15 text-red-700 dark:text-red-300 underline decoration-wavy",
}
