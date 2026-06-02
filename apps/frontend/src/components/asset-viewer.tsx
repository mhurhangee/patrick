import type { ApiAsset, FieldLocation } from "@patrickos/shared"
import { ChevronLeft, ChevronRight, Columns3, X } from "lucide-react"
import type { Value } from "platejs"
import { Fragment, useEffect, useRef, useState } from "react"
import { AnalysisPanel } from "@/components/analysis-panel"
import { PlateEditor } from "@/components/editor/plate-editor"
import {
	locationsToHighlights,
	SourceViewer,
	type SourceViewerHighlight,
} from "@/components/source-viewer"
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
import { cn } from "@/lib/utils"

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
		// Persist Plate JSON via file API — asset.id is the file path, asset.projectId is the project path
		fetch(`${BASE_URL}/artifacts/content`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				projectPath: asset.projectId,
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

function SubTab({
	active,
	onClick,
	children,
}: {
	active: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded px-2.5 py-1 text-xs transition-colors",
				active
					? "bg-accent font-medium text-accent-foreground"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	)
}

function SourcePane({
	asset,
	provider,
	apiKey,
	model,
}: {
	asset: ApiAsset
	provider: string
	apiKey: string
	model: string
}) {
	const [tab, setTab] = useState<"document" | "analysis">("document")
	const [jumpToPage, setJumpToPage] = useState<number | undefined>()
	const [highlights, setHighlights] = useState<SourceViewerHighlight[]>([])

	function locate(locations: FieldLocation[]) {
		setHighlights(locationsToHighlights(locations))
		setJumpToPage(locations[0]?.page)
		setTab("document")
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
				<SubTab active={tab === "document"} onClick={() => setTab("document")}>
					Document
				</SubTab>
				<SubTab active={tab === "analysis"} onClick={() => setTab("analysis")}>
					Analysis
				</SubTab>
			</div>
			<div className="flex-1 overflow-hidden">
				{/* Both panes stay mounted so PDF state and unsaved edits survive tab switches */}
				<div className={cn("h-full", tab !== "document" && "hidden")}>
					<SourceViewer
						src={`${BASE_URL}/files/stream?path=${encodeURIComponent(asset.path)}`}
						jumpToPage={jumpToPage}
						highlights={highlights}
					/>
				</div>
				<div className={cn("h-full", tab !== "analysis" && "hidden")}>
					<AnalysisPanel
						asset={asset}
						provider={provider}
						apiKey={apiKey}
						model={model}
						onLocate={locate}
					/>
				</div>
			</div>
		</div>
	)
}

function AssetPane({
	asset,
	onAssetUpdate,
	provider,
	apiKey,
	model,
}: {
	asset: ApiAsset
	onAssetUpdate: (updated: ApiAsset) => void
	provider: string
	apiKey: string
	model: string
}) {
	if (asset.kind === "source") {
		return (
			<SourcePane
				key={asset.id}
				asset={asset}
				provider={provider}
				apiKey={apiKey}
				model={model}
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
	onTabClick,
	onTabClose,
	onSplitToggle,
	onChatToggle,
	onAssetUpdate,
	chatCollapsed,
	provider,
	apiKey,
	model,
}: {
	assets: ApiAsset[]
	openTabIds: string[]
	activeTab: string
	splitView: boolean
	onTabClick: (id: string) => void
	onTabClose: (id: string) => void
	onSplitToggle: () => void
	onChatToggle: () => void
	onAssetUpdate: (updated: ApiAsset) => void
	chatCollapsed: boolean
	provider: string
	apiKey: string
	model: string
}) {
	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]
	const activeAsset =
		openAssets.find((a) => a.id === activeTab) ?? openAssets[0]

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="relative flex h-8 shrink-0 items-end bg-muted">
				{/* border line — tabs with z-10 render on top of it */}
				<div className="pointer-events-none absolute inset-x-0 bottom-0 bg-border" />
				<div className="relative z-10 flex shrink-0 items-center self-stretch px-2">
					<SidebarTrigger className="h-6 w-6" />
				</div>
				<div className="tab-scroll flex flex-1 items-end gap-1 overflow-x-auto px-1">
					{openAssets.map((asset) => (
						<div
							key={asset.id}
							className={cn(
								"group/tab relative flex shrink-0 items-center gap-1 self-stretch pl-3 pr-1 text-xs transition-colors cursor-default rounded-t-sm",
								!splitView && activeTab === asset.id
									? "border-t-2 border-primary shadow-sm bg-background text-foreground"
									: "border-t-2 border-primary/30 shadow-sm text-muted-foreground hover:text-foreground",
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
					))}
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
								<AssetPane
									key={asset.id}
									asset={asset}
									onAssetUpdate={onAssetUpdate}
									provider={provider}
									apiKey={apiKey}
									model={model}
								/>
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
							onAssetUpdate={onAssetUpdate}
							provider={provider}
							apiKey={apiKey}
							model={model}
						/>
					)}
				</div>
			)}
		</div>
	)
}
