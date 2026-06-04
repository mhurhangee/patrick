import { CATALOG, type SurfaceId, type TokenKind } from "@patrickos/shared"

// Chip / pill colour by token kind — shared between the Raw editor decorations
// and the Formatted view chips.
export const KIND_CHIP: Record<TokenKind | "unknown", string> = {
	context: "bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25",
	scope:
		"bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25",
	tool: "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25",
	unknown:
		"bg-red-500/15 text-red-700 dark:text-red-300 underline decoration-wavy",
}

const KIND_NOTE: Record<TokenKind, string> = {
	context: "context",
	scope: "source scope",
	tool: "tool — its presence wires the tool",
}

// The popover body shown when a token chip is clicked, in either view.
export function TokenInspector({
	tokenId,
	surface,
	value,
}: {
	tokenId: keyof typeof CATALOG
	surface: SurfaceId
	value?: string
}) {
	const meta = CATALOG[tokenId]
	const valid = (meta.surfaces as readonly SurfaceId[]).includes(surface)

	return (
		<div className="space-y-2 text-xs">
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-medium font-mono">{tokenId}</span>
				<span className="text-muted-foreground">{KIND_NOTE[meta.kind]}</span>
			</div>
			<p className="text-muted-foreground">{meta.description}</p>
			{!valid && (
				<p className="text-amber-600 dark:text-amber-500">
					Not normally used on this surface — it still resolves, but consider
					removing it.
				</p>
			)}
			<div>
				<div className="mb-1 font-medium text-[11px] text-muted-foreground">
					{meta.kind === "tool" ? "Usage in prompt" : "Live preview"}
				</div>
				<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px] leading-snug">
					{value?.trim() ? (
						value
					) : (
						<span className="text-muted-foreground italic">
							resolves to nothing in the current context
						</span>
					)}
				</pre>
			</div>
		</div>
	)
}
