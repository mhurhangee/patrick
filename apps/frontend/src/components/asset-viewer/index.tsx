import type { ApiAsset, DocMeta } from "@patrickos/shared"
import { ChevronLeft, ChevronRight, Columns3, X } from "lucide-react"
import { Fragment } from "react"
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
import { assetLabel, cn } from "@/lib/utils"
import { AssetPane } from "./asset-pane"

export function AssetViewer({
	assets,
	openTabIds,
	activeTab,
	splitView,
	tabView,
	onSetAssetView,
	onTabClick,
	onTabClose,
	onSplitToggle,
	onChatToggle,
	onAssetUpdate,
	chatCollapsed,
	doNotRead,
	onToggleDoNotRead,
	docMeta,
	onSetSignpost,
	onSetTags,
}: {
	assets: ApiAsset[]
	openTabIds: string[]
	activeTab: string
	splitView: boolean
	tabView: Record<string, string>
	onSetAssetView: (id: string, view: string) => void
	onTabClick: (id: string) => void
	onTabClose: (id: string) => void
	onSplitToggle: () => void
	onChatToggle: () => void
	onAssetUpdate: (updated: ApiAsset) => void
	chatCollapsed: boolean
	doNotRead: Set<string>
	onToggleDoNotRead: (id: string) => void
	docMeta: Record<string, DocMeta>
	onSetSignpost: (filename: string, value: string) => void
	onSetTags: (filename: string, tags: string[]) => void
}) {
	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]
	const activeAsset =
		openAssets.find((a) => a.id === activeTab) ?? openAssets[0]

	const paneProps = {
		tabView,
		onSetAssetView,
		onAssetUpdate,
		doNotRead,
		onToggleDoNotRead,
		docMeta,
		onSetSignpost,
		onSetTags,
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
									className={cn(
										"max-w-[120px] cursor-pointer truncate font-medium",
										asset.kind === "artifact" && "capitalize",
									)}
								>
									{assetLabel(asset)}
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
