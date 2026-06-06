import type { ApiAsset, ApiChat, ApiTask } from "@patrickos/shared"
import { Link } from "@tanstack/react-router"
import {
	ChevronRight,
	ChevronsUpDown,
	CircleHelp,
	MoreHorizontal,
	Plus,
	RefreshCw,
	Settings2,
	Star,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Logo } from "@/components/logo"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { assetLabel, cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

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

// Per-source kebab — star, AgentPat exclusion, derivations (extract today), and
// file ops. Delete/Rename are deliberately disabled: the app never mutates the
// attorney's original files — that's the OS's job (see CLAUDE.md).
function SourceActionsMenu({
	starred,
	excluded,
	onToggleStar,
	onToggleDoNotRead,
	onOpenExtraction,
}: {
	starred: boolean
	excluded: boolean
	onToggleStar: () => void
	onToggleDoNotRead: () => void
	onOpenExtraction: () => void
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					title="Source actions"
					className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover/src:opacity-100 data-[state=open]:opacity-100"
				>
					<MoreHorizontal size={14} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuItem onClick={onToggleStar}>
					{starred ? "Unstar" : "Star"}
				</DropdownMenuItem>
				<DropdownMenuItem onClick={onToggleDoNotRead}>
					{excluded ? "Include in AgentPat" : "Exclude from AgentPat"}
				</DropdownMenuItem>

				<DropdownMenuSeparator />
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>Derive</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuItem onClick={onOpenExtraction}>
							Extract data
						</DropdownMenuItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>

				<DropdownMenuSeparator />
				{/* Disabled on purpose — manage originals via the file system. */}
				<div>
					<Tooltip>
						<TooltipTrigger>
							<DropdownMenuItem
								onSelect={(e) => e.preventDefault()}
								className="text-muted-foreground/50 focus:bg-transparent focus:text-muted-foreground/50 cursor-not-allowed"
							>
								Rename
							</DropdownMenuItem>
						</TooltipTrigger>
						<TooltipContent side="right">
							Rename in your file system
						</TooltipContent>
					</Tooltip>
				</div>
				<div>
					<Tooltip>
						<TooltipTrigger>
							<DropdownMenuItem
								title="Delete this file in your file system"
								onSelect={(e) => e.preventDefault()}
								className="text-muted-foreground/50 focus:bg-transparent focus:text-muted-foreground/50 cursor-not-allowed"
							>
								Delete
							</DropdownMenuItem>
						</TooltipTrigger>
						<TooltipContent side="right">
							Delete in your file system
						</TooltipContent>
					</Tooltip>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

// Shared kebab trigger — hidden until row hover (group/src), shown while open.
const kebabTriggerClass =
	"shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover/src:opacity-100 data-[state=open]:opacity-100"

// Inline rename — the row's label becomes an editable field in place.
function RowRenameInput({
	initial,
	onSave,
	onCancel,
}: {
	initial: string
	onSave: (value: string) => void
	onCancel: () => void
}) {
	const [value, setValue] = useState(initial)
	function commit() {
		const v = value.trim()
		if (v && v !== initial) onSave(v)
		else onCancel()
	}
	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: rename field should grab focus immediately
			autoFocus
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onFocus={(e) => e.target.select()}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault()
					commit()
				} else if (e.key === "Escape") {
					e.preventDefault()
					onCancel()
				}
			}}
			className="h-5 min-w-0 flex-1 rounded-sm border bg-background px-1 text-xs capitalize outline-none focus:ring-1 focus:ring-ring"
		/>
	)
}

function DeleteConfirm({
	open,
	onOpenChange,
	name,
	onConfirm,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	name: string
	onConfirm: () => void
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete this {name}?</AlertDialogTitle>
					<AlertDialogDescription>
						This permanently deletes the file from your task folder and can't be
						undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

// Per-artifact kebab — star, AgentPat exclusion, and (enabled) rename/delete,
// since artifacts are app-created outputs the app may mutate.
function ArtifactActionsMenu({
	starred,
	excluded,
	onToggleStar,
	onToggleDoNotRead,
	onStartRename,
	onDelete,
}: {
	starred: boolean
	excluded: boolean
	onToggleStar: () => void
	onToggleDoNotRead: () => void
	onStartRename: () => void
	onDelete: () => void
}) {
	const [confirmOpen, setConfirmOpen] = useState(false)
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						title="Artifact actions"
						className={kebabTriggerClass}
					>
						<MoreHorizontal size={14} />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-48">
					<DropdownMenuItem onClick={onToggleStar}>
						{starred ? "Unstar" : "Star"}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onToggleDoNotRead}>
						{excluded ? "Include in AgentPat" : "Exclude from AgentPat"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={onStartRename}>Rename</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setConfirmOpen(true)}
						className="text-destructive focus:text-destructive"
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteConfirm
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				name="artifact"
				onConfirm={onDelete}
			/>
		</>
	)
}

// Per-chat kebab — star, rename, delete.
function ChatActionsMenu({
	starred,
	onToggleStar,
	onStartRename,
	onDelete,
}: {
	starred: boolean
	onToggleStar: () => void
	onStartRename: () => void
	onDelete: () => void
}) {
	const [confirmOpen, setConfirmOpen] = useState(false)
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						title="Chat actions"
						className={kebabTriggerClass}
					>
						<MoreHorizontal size={14} />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-48">
					<DropdownMenuItem onClick={onToggleStar}>
						{starred ? "Unstar" : "Star"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={onStartRename}>Rename</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setConfirmOpen(true)}
						className="text-destructive focus:text-destructive"
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteConfirm
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				name="chat"
				onConfirm={onDelete}
			/>
		</>
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
	excludedIds,
	starredIds,
	onToggleDoNotRead,
	onToggleStar,
	onOpenExtraction,
	onRenameArtifact,
	onDeleteArtifact,
	onOpen,
	onClose,
	onRefreshSources,
	onCreateArtifact,
	onOpenChat,
	onNewChat,
	onRenameChat,
	onDeleteChat,
	onToggleChatStar,
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
	excludedIds: Set<string>
	starredIds: Set<string>
	onToggleDoNotRead: (id: string) => void
	onToggleStar: (id: string) => void
	onOpenExtraction: (id: string) => void
	onRenameArtifact: (id: string, newTitle: string) => void
	onDeleteArtifact: (id: string) => void
	onOpen: (id: string) => void
	onClose: (id: string) => void
	onRefreshSources: () => void
	onCreateArtifact: () => void
	onOpenChat: (id: string) => void
	onNewChat: () => void
	onRenameChat: (id: string, newTitle: string) => void
	onDeleteChat: (id: string) => void
	onToggleChatStar: (id: string) => void
	onManageTasks: () => void
	onSettingsOpen: () => void
	onTutorialOpen: () => void
	connectedToAI: boolean
}) {
	const CHAT_LIMIT = 5
	const [showAllChats, setShowAllChats] = useState(false)
	// id of the row currently being renamed inline (artifact path or chat id).
	const [editingId, setEditingId] = useState<string | null>(null)

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
		<Sidebar>
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
								const excluded = excludedIds.has(asset.id)
								const starred = starredIds.has(asset.id)
								// Open/active border goes grey for excluded files.
								const borderColor = excluded ? "border-muted-foreground/40" : ""
								return (
									<SidebarMenuSubItem
										key={asset.id}
										className="group/src flex items-center mr-2"
									>
										{editingId === asset.id ? (
											<RowRenameInput
												initial={asset.title}
												onSave={(v) => {
													setEditingId(null)
													onRenameArtifact(asset.id, v)
												}}
												onCancel={() => setEditingId(null)}
											/>
										) : (
											<>
												<SidebarMenuSubButton
													onClick={() => {
														if (isInView) onClose(asset.id)
														else onOpen(asset.id)
													}}
													className={cn(
														"flex min-w-0 flex-1 items-center gap-1.5 h-5 rounded-none",
														isInView
															? `border-l-2 ${borderColor || "border-primary"} pl-2 font-medium`
															: openSet.has(asset.id)
																? `border-l-2 ${borderColor || "border-primary/30"} pl-2`
																: "",
													)}
												>
													{starred && <Star className="shrink-0 p-[2px]" />}
													<span
														className={cn(
															"min-w-0 flex-1 truncate",
															kind === "artifact" && "capitalize",
															excluded &&
																"text-muted-foreground/40 line-through",
														)}
														title={
															excluded ? "Excluded from AgentPat" : undefined
														}
													>
														{assetLabel(asset)}
													</span>
												</SidebarMenuSubButton>
												{kind === "source" ? (
													<SourceActionsMenu
														starred={starred}
														excluded={excluded}
														onToggleStar={() => onToggleStar(asset.id)}
														onToggleDoNotRead={() =>
															onToggleDoNotRead(asset.id)
														}
														onOpenExtraction={() => onOpenExtraction(asset.id)}
													/>
												) : (
													<ArtifactActionsMenu
														starred={starred}
														excluded={excluded}
														onToggleStar={() => onToggleStar(asset.id)}
														onToggleDoNotRead={() =>
															onToggleDoNotRead(asset.id)
														}
														onStartRename={() => setEditingId(asset.id)}
														onDelete={() => onDeleteArtifact(asset.id)}
													/>
												)}
											</>
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
							<SidebarMenuSubItem
								key={chat.id}
								className="group/src flex items-center mr-2"
							>
								{editingId === chat.id ? (
									<RowRenameInput
										initial={chat.title}
										onSave={(v) => {
											setEditingId(null)
											onRenameChat(chat.id, v)
										}}
										onCancel={() => setEditingId(null)}
									/>
								) : (
									<>
										<SidebarMenuSubButton
											onClick={() => onOpenChat(chat.id)}
											className={cn(
												"flex min-w-0 flex-1 items-center h-6 gap-1.5 rounded-none",
												chat.id === activeChatId
													? "border-l-2 border-primary pl-2 font-medium"
													: openChatSet.has(chat.id)
														? "border-l-2 border-primary/30 pl-2"
														: "",
											)}
										>
											{chat.starred && <Star className="shrink-0 p-[2px]" />}
											<span className="min-w-0 flex-1 truncate">
												{chat.title}
											</span>
										</SidebarMenuSubButton>
										<ChatActionsMenu
											starred={!!chat.starred}
											onToggleStar={() => onToggleChatStar(chat.id)}
											onStartRename={() => setEditingId(chat.id)}
											onDelete={() => onDeleteChat(chat.id)}
										/>
									</>
								)}
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
