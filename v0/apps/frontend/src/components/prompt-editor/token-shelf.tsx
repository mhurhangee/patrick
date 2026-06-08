import {
	CATALOG,
	KIND_INFO,
	recommendedTokens,
	type SurfaceId,
	type TokenKind,
	tokensForSurface,
	tokensInTemplate,
} from "@patrickos/shared"
import { cn } from "@/lib/utils"
import { KIND_CHIP } from "./inspector"

const KIND_ORDER: TokenKind[] = ["context", "scope", "tool"]

// Tokens available for this surface but not yet in the template, grouped by
// kind, click to insert. Recommended tokens (shipped in the default) that have
// been removed are flagged so deleting one is noticed.
export function TokenShelf({
	surface,
	value,
	onInsert,
}: {
	surface: SurfaceId
	value: string
	onInsert: (name: string) => void
}) {
	const inSource = new Set(tokensInTemplate(value))
	const recommended = new Set(recommendedTokens(surface))
	const toAdd = tokensForSurface(surface).filter((id) => !inSource.has(id))
	const missingCount = [...recommended].filter((id) => !inSource.has(id)).length

	return (
		<div className="shrink-0 rounded-md border bg-muted/20 px-3 py-2 text-xs">
			<div className="flex items-center gap-2">
				<span className="font-medium text-muted-foreground">Add tokens</span>
				{missingCount > 0 && (
					<span className="text-amber-600 dark:text-amber-500">
						⚠ {missingCount} recommended token{missingCount > 1 ? "s" : ""} not
						in your prompt (highlighted below)
					</span>
				)}
			</div>

			{toAdd.length === 0 ? (
				<p className="mt-1 text-muted-foreground">
					All available tokens are in your prompt.
				</p>
			) : (
				<div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
					{KIND_ORDER.map((kind) => {
						const ids = toAdd.filter((id) => CATALOG[id].kind === kind)
						if (!ids.length) return null
						return (
							<div key={kind} className="flex items-center gap-1.5">
								<span
									className="text-[10px] text-muted-foreground uppercase tracking-wide"
									title={KIND_INFO[kind].help}
								>
									{KIND_INFO[kind].label}
								</span>
								{ids.map((id) => (
									<button
										key={id}
										type="button"
										onClick={() => onInsert(id)}
										title={`${CATALOG[id].description}${recommended.has(id) ? " (recommended)" : ""}`}
										className={cn(
											"rounded px-1 font-mono text-[11px] transition-colors",
											KIND_CHIP[CATALOG[id].kind],
											recommended.has(id) && "ring-1 ring-amber-500/60",
										)}
									>
										+ {id}
									</button>
								))}
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
