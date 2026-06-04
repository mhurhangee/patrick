import type { ApiAsset, FieldLocation, TaskType } from "@patrickos/shared"
import { ChevronLeft, ChevronRight, Columns3, X } from "lucide-react"
import type { Value } from "platejs"
import { Fragment, useEffect, useRef, useState } from "react"
import { PlateEditor } from "@/components/editor/plate-editor"
import {
	ExtractionBody,
	ExtractionMenu,
	useExtraction,
} from "@/components/extraction-panel"
import { locationsToHighlights, SourceViewer } from "@/components/source-viewer"
import { Button } from "@/components/ui/button"
import {
	Empty,
	EmptyContent,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { BASE_URL } from "@/lib/api"
import type { AssetView } from "@/lib/use-asset-state"
import { cn } from "@/lib/utils"

// A field's locations being shown in the document view — drives highlights + page jump.
type LocateState = {
	sourcePath: string
	locations: FieldLocation[]
	index: number
}

function ArtifactEditor({
	asset,
	onAssetUpdate,
}: {
	asset: ApiAsset
	onAssetUpdate: (updated: ApiAsset) => void
}) {
	const saveTimer = useRef<ReturnType<typeof setTimeout>>(null)
	const latestValue = useRef<Value | null>(null)
	const isDirty = useRef(false)

	function save(value: Value) {
		// Persist Plate JSON via file API — asset.id is the file path, asset.taskId is the task path
		fetch(`${BASE_URL}/artifacts/content`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				taskPath: asset.taskId,
				filename: asset.filename,
				content: JSON.stringify(value),
			}),
		})
			.then((r) => r.json())
			.then(() => onAssetUpdate({ ...asset, content: JSON.stringify(value) }))
	}

	function handleChange(value: Value) {
		latestValue.current = value
		isDirty.current = true
		if (saveTimer.current) clearTimeout(saveTimer.current)
		saveTimer.current = setTimeout(() => {
			save(value)
			isDirty.current = false
		}, 500)
	}

	// Tell the AI transport what kind of document is open so prompts can be doc-type-aware
	useEffect(() => {
		localStorage.setItem("askpat-asset-type", asset.type)
	}, [asset.type])

	// Flush on unmount (tab switch, close) — intentionally no deps, save is stable for asset lifetime
	// biome-ignore lint/correctness/useExhaustiveDependencies: unmount-only flush, save recreated each render
	useEffect(() => {
		return () => {
			if (saveTimer.current) clearTimeout(saveTimer.current)
			if (isDirty.current && latestValue.current) {
				save(latestValue.current)
			}
		}
	}, [])

	let initialValue: Value | undefined
	try {
		if (asset.content) initialValue = JSON.parse(asset.content) as Value
	} catch {
		// malformed content — start empty
	}

	return (
		<div className="h-full overflow-hidden">
			<PlateEditor initialValue={initialValue} onChange={handleChange} />
		</div>
	)
}

// Segmented toggle between a source's document (PDF) and its ExtractPat extraction.
// The dot on the Extracted-Data half mirrors the old sidebar microscope: green =
// extracted, amber = not yet.
function SourceExtractionToggle({
	view,
	onChange,
	extracted,
}: {
	view: AssetView
	onChange: (v: AssetView) => void
	extracted: boolean
}) {
	return (
		<div className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5 text-xs">
			<button
				type="button"
				onClick={() => onChange("source")}
				className={cn(
					"rounded-sm px-2 py-1 transition-colors",
					view === "source"
						? "bg-background font-medium text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				Source
			</button>
			<button
				type="button"
				onClick={() => onChange("extraction")}
				className={cn(
					"flex items-center gap-1.5 rounded-sm px-2 py-1 transition-colors",
					view === "extraction"
						? "bg-background font-medium text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<span
					className={cn(
						"size-1.5 rounded-full",
						extracted ? "bg-green-500" : "bg-amber-500",
					)}
					title={extracted ? "Extracted" : "Not extracted"}
				/>
				Extracted Data
			</button>
		</div>
	)
}

// A source tab: one control row (Source ⇄ Extracted-Data toggle + ExtractPat controls),
// then either the PDF viewer or the extraction form below it.
function SourcePane({
	asset,
	view,
	onSetView,
	extracted,
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
	view: AssetView
	onSetView: (v: AssetView) => void
	extracted: boolean
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

	// Running ExtractPat flips to the Extracted-Data view so the stream is visible.
	function handleRun() {
		onSetView("extraction")
		extraction.run()
	}

	const mine = locate && locate.sourcePath === asset.path ? locate : null
	const highlights = mine
		? locationsToHighlights(mine.locations, mine.index)
		: []
	const jumpToPage = mine ? mine.locations[mine.index]?.page : undefined

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
				<SourceExtractionToggle
					view={view}
					onChange={onSetView}
					extracted={extracted}
				/>
				<div className="ml-auto flex items-center gap-2">
					<ExtractionMenu
						extraction={extraction}
						apiKey={apiKey}
						excludedFromAgent={excludedFromAgent}
						onRun={handleRun}
					/>
				</div>
			</div>

			{view === "extraction" ? (
				<ExtractionBody
					asset={asset}
					extraction={extraction}
					excludedFromAgent={excludedFromAgent}
					onLocate={(locs) => onLocate(asset.path, locs)}
				/>
			) : (
				<>
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
				</>
			)}
		</div>
	)
}

function AssetPane({
	asset,
	tabView,
	onSetAssetView,
	extractedFilenames,
	onAssetUpdate,
	provider,
	apiKey,
	model,
	onExtracted,
	locate,
	onLocate,
	onLocatePrev,
	onLocateNext,
	onLocateClear,
	doNotRead,
	onToggleDoNotRead,
	taskType,
}: {
	asset: ApiAsset
	tabView: Record<string, AssetView>
	onSetAssetView: (id: string, view: AssetView) => void
	extractedFilenames: Set<string>
	onAssetUpdate: (updated: ApiAsset) => void
	provider: string
	apiKey: string
	model: string
	onExtracted: () => void
	locate: LocateState | null
	onLocate: (sourcePath: string, locations: FieldLocation[]) => void
	onLocatePrev: () => void
	onLocateNext: () => void
	onLocateClear: () => void
	doNotRead: Set<string>
	onToggleDoNotRead: (id: string) => void
	taskType?: TaskType
}) {
	if (asset.kind === "source") {
		return (
			<SourcePane
				key={asset.id}
				asset={asset}
				view={tabView[asset.id] ?? "source"}
				onSetView={(v) => onSetAssetView(asset.id, v)}
				extracted={extractedFilenames.has(asset.filename)}
				locate={locate}
				onLocate={onLocate}
				onLocatePrev={onLocatePrev}
				onLocateNext={onLocateNext}
				onLocateClear={onLocateClear}
				excludedFromAgent={doNotRead.has(asset.id)}
				onToggleExclude={() => onToggleDoNotRead(asset.id)}
				provider={provider}
				apiKey={apiKey}
				model={model}
				onExtracted={onExtracted}
				taskType={taskType}
			/>
		)
	}

	return (
		<ArtifactEditor
			key={asset.id}
			asset={asset}
			onAssetUpdate={onAssetUpdate}
		/>
	)
}

export function AssetViewer({
	assets,
	openTabIds,
	activeTab,
	splitView,
	tabView,
	onSetAssetView,
	extractedFilenames,
	onTabClick,
	onTabClose,
	onOpen,
	onSplitToggle,
	onChatToggle,
	onAssetUpdate,
	chatCollapsed,
	provider,
	apiKey,
	model,
	onExtracted,
	doNotRead,
	onToggleDoNotRead,
	taskType,
}: {
	assets: ApiAsset[]
	openTabIds: string[]
	activeTab: string
	splitView: boolean
	tabView: Record<string, AssetView>
	onSetAssetView: (id: string, view: AssetView) => void
	extractedFilenames: Set<string>
	onTabClick: (id: string) => void
	onTabClose: (id: string) => void
	onOpen: (id: string, view?: AssetView) => void
	onSplitToggle: () => void
	onChatToggle: () => void
	onAssetUpdate: (updated: ApiAsset) => void
	chatCollapsed: boolean
	provider: string
	apiKey: string
	model: string
	onExtracted: () => void
	doNotRead: Set<string>
	onToggleDoNotRead: (id: string) => void
	taskType?: TaskType
}) {
	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]
	const activeAsset =
		openAssets.find((a) => a.id === activeTab) ?? openAssets[0]

	const [locate, setLocate] = useState<LocateState | null>(null)

	function handleLocate(sourcePath: string, locations: FieldLocation[]) {
		if (!locations.length) return
		// Open + focus the source in its document view so the highlight is visible.
		onOpen(sourcePath, "source")
		setLocate({ sourcePath, locations, index: 0 })
	}
	function locatePrev() {
		setLocate((l) =>
			l
				? {
						...l,
						index: (l.index - 1 + l.locations.length) % l.locations.length,
					}
				: l,
		)
	}
	function locateNext() {
		setLocate((l) =>
			l ? { ...l, index: (l.index + 1) % l.locations.length } : l,
		)
	}

	const paneProps = {
		tabView,
		onSetAssetView,
		extractedFilenames,
		onAssetUpdate,
		provider,
		apiKey,
		model,
		onExtracted,
		locate,
		onLocate: handleLocate,
		onLocatePrev: locatePrev,
		onLocateNext: locateNext,
		onLocateClear: () => setLocate(null),
		doNotRead,
		onToggleDoNotRead,
		taskType,
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="relative flex h-7 shrink-0 items-end bg-muted">
				{/* border line — tabs with z-10 render on top of it */}
				<div className="relative z-10 flex shrink-0 items-center self-stretch px-2">
					<SidebarTrigger className="h-6 w-6" />
				</div>
				<div className="tab-scroll flex flex-1 h-6 items-end overflow-x-auto px-1">
					{openAssets.map((asset) => {
						const tabExcluded = doNotRead.has(asset.id)
						const tabActive = !splitView && activeTab === asset.id
						return (
							<div
								key={asset.id}
								className={cn(
									"group/tab relative flex shrink-0 items-center gap-1 self-stretch pl-2 pr-1 text-xs transition-colors cursor-default",
									tabActive
										? cn(
												"bg-background text-foreground text-xxs",
												tabExcluded
													? "border-t-2 border-muted-foreground/40"
													: "border-t-2 border-primary",
											)
										: cn(
												"text-muted-foreground hover:text-foreground text-xxs",
												tabExcluded
													? "border-t-2 border-muted-foreground/25"
													: "border-t-2 border-primary/30",
											),
								)}
							>
								<button
									type="button"
									onClick={() => onTabClick(asset.id)}
									className="max-w-[120px] cursor-pointer truncate capitalize font-medium"
								>
									{asset.title}
								</button>
								<button
									type="button"
									onClick={() => onTabClose(asset.id)}
									className="shrink-0 opacity-0 transition-opacity group-hover/tab:opacity-100"
								>
									<X size={8} />
								</button>
							</div>
						)
					})}
					{openAssets.length >= 1 && (
						<div
							className={cn(
								"relative flex items-center rounded-t-md border border-b-0 text-xs transition-colors",
								splitView
									? "z-10 border-border bg-background text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							<Button
								variant="ghost"
								size="xs"
								onClick={onSplitToggle}
								disabled={openAssets.length < 2}
							>
								<Columns3 />
							</Button>
						</div>
					)}
				</div>
				<div className="relative z-10 flex shrink-0 items-center self-stretch">
					<Button variant="ghost" size="icon" onClick={onChatToggle}>
						{chatCollapsed ? <ChevronLeft /> : <ChevronRight />}
					</Button>
				</div>
			</div>

			{openAssets.length === 0 ? (
				<div className="flex h-full flex-col items-center justify-center gap-6 overflow-hidden">
					<Empty className="max-w-xs border-0">
						<EmptyHeader>
							<EmptyTitle>Nothing open</EmptyTitle>
							<EmptyContent>Add or open docs from the sidebar</EmptyContent>
						</EmptyHeader>
					</Empty>
					<div className="min-h-[64px]" />
				</div>
			) : splitView && openAssets.length > 1 ? (
				<ResizablePanelGroup orientation="horizontal" className="flex-1">
					{openAssets.map((asset, i) => (
						<Fragment key={asset.id}>
							{i > 0 && <ResizableHandle withHandle />}
							<ResizablePanel
								defaultSize={`${100 / openAssets.length}%`}
								collapsible
								collapsedSize="0%"
								minSize="10%"
							>
								<AssetPane key={asset.id} asset={asset} {...paneProps} />
							</ResizablePanel>
						</Fragment>
					))}
				</ResizablePanelGroup>
			) : (
				<div className="flex-1 overflow-hidden">
					{activeAsset && (
						<AssetPane
							key={activeAsset.id}
							asset={activeAsset}
							{...paneProps}
						/>
					)}
				</div>
			)}
		</div>
	)
}
