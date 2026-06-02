import type { ApiAsset, ApiChat, ApiTask } from "@patrickos/shared"
import { Link } from "@tanstack/react-router"
import {
	ChevronRight,
	ChevronsUpDown,
	CircleHelp,
	Microscope,
	Plus,
	RefreshCw,
	Settings2,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Logo } from "@/components/logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// ─── Collapsible section ──────────────────────────────────────────────────────

type SectionAction = {
	icon: ReactNode
	label: string
	onClick: () => void
	disabled?: boolean
}

function CollapsibleSection({
	label,
	action,
	children,
}: {
	label: string
	action?: SectionAction
	children: ReactNode
}) {
	const [open, setOpen] = useState(true)
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SidebarGroup className="py-1">
				<div className="flex items-center">
					<CollapsibleTrigger asChild>
						<SidebarGroupLabel asChild>
							<button
								type="button"
								className="flex flex-1 cursor-pointer items-center gap-1.5"
							>
								<ChevronRight
									className={cn(
										"size-3.5 shrink-0 text-muted-foreground/50 transition-transform",
										open && "rotate-90",
									)}
								/>
								{label}
							</button>
						</SidebarGroupLabel>
					</CollapsibleTrigger>
					{action && (
						<button
							type="button"
							title={action.label}
							onClick={action.onClick}
							disabled={action.disabled}
							className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
						>
							{action.icon}
							<span className="sr-only">{action.label}</span>
						</button>
					)}
				</div>
				<CollapsibleContent>
					<SidebarMenu className="mb-2 ml-2">{children}</SidebarMenu>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	)
}

export function AppSidebar({
	assets,
	openTabIds,
	activeTabId,
	splitView,
	chats,
	activeChatId,
	openChatIds,
	tasks,
	tasksLoading,
	currentTaskId,
	analysedFilenames,
	onOpen,
	onOpenAnalysis,
	onClose,
	onRefreshSources,
	onCreateArtifact,
	onOpenChat,
	onNewChat,
	onEditChat,
	onManageTasks,
	onSettingsOpen,
	onTutorialOpen,
	connectedToAI,
}: {
	assets: ApiAsset[]
	openTabIds: string[]
	activeTabId: string
	splitView: boolean
	chats: ApiChat[]
	openChatIds: string[]
	activeChatId: string
	tasks: ApiTask[]
	tasksLoading: boolean
	currentTaskId: string
	analysedFilenames: Set<string>
	onOpen: (id: string) => void
	onOpenAnalysis: (sourceId: string) => void
	onClose: (id: string) => void
	onRefreshSources: () => void
	onCreateArtifact: () => void
	onOpenChat: (id: string) => void
	onNewChat: () => void
	onEditChat: (id: string) => void
	onManageTasks: () => void
	onSettingsOpen: () => void
	onTutorialOpen: () => void
	connectedToAI: boolean
}) {
	const CHAT_LIMIT = 5
	const [showAllChats, setShowAllChats] = useState(false)

	const openSet = new Set(openTabIds)
	const openChatSet = new Set(openChatIds)
	const sorted = [...assets].sort((a, b) => a.date.localeCompare(b.date))
	const assetGroups: {
		kind: "source" | "artifact"
		label: string
		items: ApiAsset[]
		action: SectionAction
	}[] = [
		{
			kind: "source",
			label: "Sources",
			items: sorted.filter((a) => a.kind === "source"),
			action: {
				icon: <RefreshCw className="size-4" />,
				label: "Refresh sources",
				onClick: onRefreshSources,
			},
		},
		{
			kind: "artifact",
			label: "Artifacts",
			items: sorted.filter((a) => a.kind === "artifact"),
			action: {
				icon: <Plus className="size-4" />,
				label: "New artifact",
				onClick: onCreateArtifact,
			},
		},
	]
	const sortedChats = [...chats].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	)
	const visibleChats = showAllChats
		? sortedChats
		: sortedChats.slice(0, CHAT_LIMIT)
	const currentTask = tasks.find((p) => p.path === currentTaskId)

	return (
		<Sidebar variant="inset">
			<SidebarHeader className="gap-0 px-3 py-2">
				<div className="flex items-center py-2">
					<Link to="/" className="flex items-center">
						<Logo size={20} />
					</Link>
					<Button
						onClick={onManageTasks}
						variant="ghost"
						className="text-base font-semibold capitalize tracking-tight shrink-0"
						size="default"
					>
						<ChevronsUpDown
							size={11}
							className="shrink-0 text-muted-foreground"
						/>
						<span className="flex items-center">
							{tasksLoading ? "Loading…" : (currentTask?.name ?? "Select task")}
						</span>
					</Button>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{/* Sources + Artifacts — only shown when a task is selected */}
				{currentTaskId &&
					assetGroups.map(({ kind, label, items, action }) => (
						<CollapsibleSection key={kind} label={label} action={action}>
							{tasksLoading ? (
								<div className="flex flex-col gap-1.5 px-3 py-1 group-data-[collapsible=icon]:hidden">
									<Skeleton className="h-3 w-3/4" />
									<Skeleton className="h-3 w-1/2" />
								</div>
							) : null}
							{items.map((asset) => {
								const isInView = splitView
									? openSet.has(asset.id)
									: asset.id === activeTabId
								return (
									<SidebarMenuSubItem
										key={asset.id}
										className="flex items-center mr-2"
									>
										<SidebarMenuSubButton
											onClick={() => {
												if (isInView) onClose(asset.id)
												else onOpen(asset.id)
											}}
											className={cn(
												"flex min-w-0 flex-1 items-center h-5 rounded-none",
												isInView
													? "border-l-2 border-primary pl-2 font-medium"
													: openSet.has(asset.id)
														? "border-l-2 border-primary/30 pl-2"
														: "",
											)}
										>
											<span className="capitalize min-w-0 flex-1 truncate">
												{asset.title}
											</span>
										</SidebarMenuSubButton>
										{kind === "source" && (
											<button
												type="button"
												title={
													analysedFilenames.has(asset.filename)
														? "View analysis"
														: "Not analysed — open to run ExtractPat"
												}
												onClick={() => onOpenAnalysis(asset.id)}
												className={cn(
													"shrink-0 rounded p-0.5 transition-colors hover:bg-accent",
													analysedFilenames.has(asset.filename)
														? "text-primary"
														: "text-amber-500 hover:text-amber-600",
												)}
											>
												<Microscope size={12} />
											</button>
										)}
									</SidebarMenuSubItem>
								)
							})}
						</CollapsibleSection>
					))}

				{/* Chats — only shown when a task is selected */}
				{currentTaskId && (
					<CollapsibleSection
						label="Chats"
						action={{
							icon: <Plus className="size-4" />,
							label: "New chat",
							onClick: onNewChat,
							disabled: !connectedToAI,
						}}
					>
						{tasksLoading ? (
							<div className="flex flex-col gap-1.5 px-3 py-1 group-data-[collapsible=icon]:hidden">
								<Skeleton className="h-3 w-2/3" />
								<Skeleton className="h-3 w-1/2" />
								<Skeleton className="h-3 w-3/5" />
							</div>
						) : null}
						{visibleChats.map((chat) => (
							<SidebarMenuSubItem key={chat.id}>
								<SidebarMenuSubButton
									onClick={() => onOpenChat(chat.id)}
									className={cn(
										"flex items-center justify-between h-6 gap-1.5 rounded-none",
										chat.id === activeChatId
											? "border-l-2 border-primary pl-2 font-medium"
											: openChatSet.has(chat.id)
												? "border-l-2 border-primary/30 pl-2"
												: "",
									)}
								>
									<span className="truncate">{chat.title}</span>
									<Badge
										variant="secondary"
										className="shrink-0 text-xxs font-normal cursor-pointer hover:bg-secondary/80"
										onClick={(e) => {
											e.stopPropagation()
											onEditChat(chat.id)
										}}
									>
										{chat.messageCount ?? 0}
									</Badge>
								</SidebarMenuSubButton>
							</SidebarMenuSubItem>
						))}
						{sortedChats.length > CHAT_LIMIT && (
							<SidebarMenuSubItem>
								<SidebarMenuSubButton
									onClick={() => setShowAllChats((v) => !v)}
									className="justify-center text-muted-foreground ml-2"
								>
									{showAllChats
										? "Show less"
										: `${sortedChats.length - CHAT_LIMIT} older…`}
								</SidebarMenuSubButton>
							</SidebarMenuSubItem>
						)}
					</CollapsibleSection>
				)}
			</SidebarContent>

			<SidebarFooter className="p-2">
				<SidebarMenu>
					<div className="flex items-center justify-between gap-2 px-3 py-2">
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={onSettingsOpen}
								className="gap-2 text-xs text-muted-foreground hover:text-foreground"
							>
								<div
									className={cn(
										"h-2 w-2 shrink-0 rounded-full",
										connectedToAI ? "bg-green-600" : "bg-muted-foreground/40",
									)}
								/>
								{connectedToAI ? "connected" : "not connected"}
							</SidebarMenuButton>
						</SidebarMenuItem>
						<div className="flex items-center">
							<SidebarMenuItem>
								<SidebarMenuButton
									onClick={onTutorialOpen}
									className="gap-2 text-muted-foreground hover:text-foreground"
									title="How it works"
								>
									<CircleHelp size={14} />
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton onClick={onSettingsOpen} className="gap-2">
									<Settings2 size={14} />
								</SidebarMenuButton>
							</SidebarMenuItem>
						</div>
					</div>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}
