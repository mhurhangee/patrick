import type { ApiAsset } from "@patrickos/db"
import { ChevronLeft, ChevronRight, Columns3, X } from "lucide-react"
import type { Value } from "platejs"
import { Fragment, useEffect, useRef } from "react"
import { PlateEditor } from "@/components/editor/plate-editor"
import { SourceViewer } from "@/components/source-viewer"
import { Button } from "@/components/ui/button"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { api, BASE_URL } from "@/lib/api"
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
		api.assets
			.update(asset.id, { content: JSON.stringify(value) })
			.then(onAssetUpdate)
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

function AssetPane({
	asset,
	onAssetUpdate,
}: {
	asset: ApiAsset
	onAssetUpdate: (updated: ApiAsset) => void
}) {
	if (asset.kind === "source") {
		return <SourceViewer src={`${BASE_URL}/assets/${asset.id}/file`} />
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
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />
				<div className="relative z-10 flex shrink-0 items-center self-stretch px-2">
					<SidebarTrigger className="h-6 w-6" />
				</div>
				<div className="tab-scroll flex flex-1 items-end gap-0.5 overflow-x-auto px-1">
					{openAssets.map((asset) => (
						<div
							key={asset.id}
							className={cn(
								"group relative flex shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
								!splitView && activeTab === asset.id
									? "z-10 border-border bg-background text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							<Button
								variant="ghost"
								size="xs"
								onClick={() => onTabClick(asset.id)}
								className="gap-1.5 rounded-none rounded-tl-md pr-0.5"
							>
								<span className="max-w-[120px] truncate">{asset.title}</span>
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={() => onTabClose(asset.id)}
								className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
							>
								<X size={10} />
							</Button>
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
							<EmptyDescription>
								Open one from the sidebar to get started
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
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
						/>
					)}
				</div>
			)}
		</div>
	)
}
