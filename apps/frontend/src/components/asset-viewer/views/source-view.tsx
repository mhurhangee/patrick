import type { ApiAsset, FieldLocation } from "@patrickos/shared"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { locationsToHighlights, SourceViewer } from "@/components/source-viewer"
import { Button } from "@/components/ui/button"
import { BASE_URL } from "@/lib/api"

// A field's locations being shown in the document view — drives highlights + page jump.
export type LocateState = {
	sourcePath: string
	locations: FieldLocation[]
	index: number
}

// The document (PDF) view of a source, with the "Located" highlight banner.
export function SourceView({
	asset,
	locate,
	onLocatePrev,
	onLocateNext,
	onLocateClear,
	excludedFromAgent,
	onToggleExclude,
}: {
	asset: ApiAsset
	locate: LocateState | null
	onLocatePrev: () => void
	onLocateNext: () => void
	onLocateClear: () => void
	excludedFromAgent: boolean
	onToggleExclude: () => void
}) {
	const mine = locate && locate.sourcePath === asset.path ? locate : null
	const highlights = mine
		? locationsToHighlights(mine.locations, mine.index)
		: []
	const jumpToPage = mine ? mine.locations[mine.index]?.page : undefined

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			{mine && (
				<div className="flex shrink-0 items-center gap-1.5 border-b bg-amber-100/40 px-3 py-1 text-xs dark:bg-amber-500/10">
					<span className="text-muted-foreground">Located</span>
					{mine.locations.length > 1 && (
						<div className="flex items-center gap-1">
							<Button variant="ghost" size="icon-xs" onClick={onLocatePrev}>
								<ChevronLeft size={12} />
							</Button>
							<span className="tabular-nums text-muted-foreground">
								{mine.index + 1} / {mine.locations.length}
							</span>
							<Button variant="ghost" size="icon-xs" onClick={onLocateNext}>
								<ChevronRight size={12} />
							</Button>
						</div>
					)}
					<Button
						variant="ghost"
						size="icon-xs"
						className="ml-auto"
						onClick={onLocateClear}
						title="Clear highlight"
					>
						<X size={12} />
					</Button>
				</div>
			)}
			<div className="flex-1 overflow-hidden">
				<SourceViewer
					src={`${BASE_URL}/files/stream?path=${encodeURIComponent(asset.path)}`}
					jumpToPage={jumpToPage}
					highlights={highlights}
					excludedFromAgent={excludedFromAgent}
					onToggleExclude={onToggleExclude}
				/>
			</div>
		</div>
	)
}
