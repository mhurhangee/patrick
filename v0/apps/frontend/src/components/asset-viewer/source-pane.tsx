import type { ApiAsset } from "@patrickos/shared"
import { type ViewOption, ViewToggle } from "./view-toggle"
import { NotesView } from "./views/notes-view"
import { SourceView } from "./views/source-view"

// A source tab: one control row (Source | Notes toggle), then the active view.
export function SourcePane({
	asset,
	view,
	onSetView,
	excludedFromAgent,
	onToggleExclude,
}: {
	asset: ApiAsset
	view: string
	onSetView: (v: string) => void
	excludedFromAgent: boolean
	onToggleExclude: () => void
}) {
	const options: ViewOption[] = [
		{ id: "source", label: "Source" },
		{ id: "notes", label: "Notes" },
	]
	const activeView = options.some((o) => o.id === view) ? view : "source"

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
				<ViewToggle
					options={options}
					active={activeView}
					onChange={onSetView}
				/>
			</div>
			<div className="flex flex-1 flex-col overflow-hidden">
				{activeView === "notes" ? (
					<NotesView asset={asset} />
				) : (
					<SourceView
						asset={asset}
						excludedFromAgent={excludedFromAgent}
						onToggleExclude={onToggleExclude}
					/>
				)}
			</div>
		</div>
	)
}
