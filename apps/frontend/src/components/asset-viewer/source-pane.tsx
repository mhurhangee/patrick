import type { ApiAsset, FieldLocation, TaskType } from "@patrickos/shared"
import { ExtractionBody, useExtraction } from "@/components/extraction-panel"
import type { DerivationId } from "@/lib/derivations"
import { DERIVATIONS } from "@/lib/derivations"
import { DeriveMenu } from "./derive-menu"
import { type ViewOption, ViewToggle } from "./view-toggle"
import { NotesView } from "./views/notes-view"
import { type LocateState, SourceView } from "./views/source-view"

// A source tab: one control row (view toggle + Derive ▾), then the active view
// below it. "source" and "notes" are always available; derivation views (today
// just "extraction") appear once a record exists or while one is running.
export function SourcePane({
	asset,
	view,
	onSetView,
	extracted,
	noted,
	onNoted,
	locate,
	onLocate,
	onLocatePrev,
	onLocateNext,
	onLocateClear,
	excludedFromAgent,
	onToggleExclude,
	provider,
	apiKey,
	model,
	onExtracted,
	taskType,
}: {
	asset: ApiAsset
	view: string
	onSetView: (v: string) => void
	extracted: boolean
	noted: boolean
	onNoted: (filename: string) => void
	locate: LocateState | null
	onLocate: (sourcePath: string, locations: FieldLocation[]) => void
	onLocatePrev: () => void
	onLocateNext: () => void
	onLocateClear: () => void
	excludedFromAgent: boolean
	onToggleExclude: () => void
	provider: string
	apiKey: string
	model: string
	onExtracted: () => void
	taskType?: TaskType
}) {
	const extraction = useExtraction({
		asset,
		provider,
		apiKey,
		model,
		onExtracted,
		taskType,
	})

	// Running a derivation flips to its view so the stream is visible.
	function handleRun() {
		onSetView("extraction")
		extraction.run()
	}

	// Which derivation views are shown for this source. A derivation segment
	// appears once its record exists or is running — and also when it's the active
	// view, so deep-links (kebab "Extract data", chat Review) land on its empty
	// state with Derive ▾ available rather than silently falling back to Source.
	const derivationExists: Record<DerivationId, boolean> = {
		extraction: extracted || extraction.isExtracting || view === "extraction",
	}
	const options: ViewOption[] = [
		{ id: "source", label: "Source" },
		{ id: "notes", label: "Notes", dot: noted ? "filled" : "hollow" },
		...DERIVATIONS.filter((d) => derivationExists[d.id]).map((d) => ({
			id: d.id,
			label: d.label,
		})),
	]
	// Guard against a stale active view (e.g. an extraction was just cleared).
	const activeView = options.some((o) => o.id === view) ? view : "source"

	function renderBody() {
		switch (activeView) {
			case "extraction":
				return (
					<ExtractionBody
						asset={asset}
						extraction={extraction}
						excludedFromAgent={excludedFromAgent}
						onLocate={(locs) => onLocate(asset.path, locs)}
					/>
				)
			case "notes":
				return (
					<NotesView asset={asset} onSaved={() => onNoted(asset.filename)} />
				)
			default:
				return (
					<SourceView
						asset={asset}
						locate={locate}
						onLocatePrev={onLocatePrev}
						onLocateNext={onLocateNext}
						onLocateClear={onLocateClear}
						excludedFromAgent={excludedFromAgent}
						onToggleExclude={onToggleExclude}
					/>
				)
		}
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
				<ViewToggle
					options={options}
					active={activeView}
					onChange={onSetView}
				/>
				<div className="ml-auto flex items-center gap-2">
					<DeriveMenu
						extraction={extraction}
						apiKey={apiKey}
						excludedFromAgent={excludedFromAgent}
						onRun={handleRun}
					/>
				</div>
			</div>
			<div className="flex flex-1 flex-col overflow-hidden">{renderBody()}</div>
		</div>
	)
}
