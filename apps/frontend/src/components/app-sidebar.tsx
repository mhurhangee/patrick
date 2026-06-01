import type { ApiAsset, ApiChat, ApiProject } from "@patrickos/shared"
import { ASSET_CONFIGS } from "@patrickos/shared"
import { Link } from "@tanstack/react-router"
import { ChevronsUpDown, CircleHelp, Plus, Settings2 } from "lucide-react"
import { useState } from "react"
import { Logo } from "@/components/logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
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

export function AppSidebar({
	assets,
	openTabIds,
	activeTabId,
	splitView,
	chats,
	activeChatId,
	openChatIds,
	projects,
	projectsLoading,
	currentProjectId,
	onOpen,
	onClose,
	onEdit,
	onAddArtifact,
	onAddSource,
	onOpenChat,
	onNewChat,
	onEditChat,
	onManageProjects,
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
	projects: ApiProject[]
	projectsLoading: boolean
	currentProjectId: string
	onOpen: (id: string) => void
	onClose: (id: string) => void
	onEdit: (id: string) => void
	onAddArtifact: () => void
	onAddSource: () => void
	onOpenChat: (id: string) => void
	onNewChat: () => void
	onEditChat: (id: string) => void
	onManageProjects: () => void
	onSettingsOpen: () => void
	onTutorialOpen: () => void
	connectedToAI: boolean
}) {
	const CHAT_LIMIT = 5
	const [showAllChats, setShowAllChats] = useState(false)

	const openSet = new Set(openTabIds)
	const openChatSet = new Set(openChatIds)
	const sorted = [...assets].sort((a, b) => a.date.localeCompare(b.date))
	const assetGroups = [
		{
			kind: "source" as const,
			label: "Sources",
			items: sorted.filter((a) => a.kind === "source"),
			onAdd: onAddSource,
			addLabel: "Add source",
		},
		{
			kind: "artifact" as const,
			label: "Artifacts",
			items: sorted.filter((a) => a.kind === "artifact"),
			onAdd: onAddArtifact,
			addLabel: "New artifact",
		},
	]
	const sortedChats = [...chats].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	)
	const visibleChats = showAllChats
		? sortedChats
		: sortedChats.slice(0, CHAT_LIMIT)
	const currentProject = projects.find((p) => p.path === currentProjectId)

	return (
		<Sidebar variant="inset">
			<SidebarHeader className="gap-0 px-3 py-2">
				<div className="flex items-center py-2">
					<Link to="/" className="flex items-center">
						<Logo size={20} />
					</Link>
					<Button
						onClick={onManageProjects}
						variant="ghost"
						className="text-base font-semibold capitalize tracking-tight shrink-0"
						size="default"
					>
						<ChevronsUpDown
							size={11}
							className="shrink-0 text-muted-foreground"
						/>
						<span className="flex items-center">
							{projectsLoading
								? "Loading…"
								: (currentProject?.name ?? "Select project")}
						</span>
					</Button>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{/* Sources + Artifacts — only shown when a project is selected */}
				{currentProjectId &&
					assetGroups.map(({ kind, label, items, onAdd, addLabel }) => (
						<SidebarGroup key={kind}>
							<SidebarGroupLabel>{label}</SidebarGroupLabel>
							<SidebarGroupAction title={addLabel} onClick={onAdd}>
								<Plus />
								<span className="sr-only">{addLabel}</span>
							</SidebarGroupAction>
							<SidebarMenu className="mb-2 ml-2">
								{projectsLoading ? (
									<div className="flex flex-col gap-1.5 px-3 py-1 group-data-[collapsible=icon]:hidden">
										<Skeleton className="h-3 w-3/4" />
										<Skeleton className="h-3 w-1/2" />
									</div>
								) : null}
								{items.map((asset) => (
									<SidebarMenuSubItem key={asset.id}>
										<SidebarMenuSubButton
											onClick={() => {
												const isInView = splitView
													? openSet.has(asset.id)
													: asset.id === activeTabId

												if (isInView) onClose(asset.id)
												else onOpen(asset.id)
											}}
											className={cn(
												"flex items-center justify-between h-5 rounded-none gap-1.5 mr-2",
											)}
										>
											<span className="capitalize min-w-0 flex-1 truncate">
												{asset.title}
											</span>

											<Badge
												variant="secondary"
												className="shrink-0 text-xxs font-normal cursor-pointer hover:bg-secondary/80"
												onClick={(e) => {
													e.stopPropagation()
													onEdit(asset.id)
												}}
											>
												{ASSET_CONFIGS.find((c) => c.id === asset.type)
													?.groupLabel ?? asset.type}
											</Badge>
										</SidebarMenuSubButton>
									</SidebarMenuSubItem>
								))}
							</SidebarMenu>
						</SidebarGroup>
					))}

				{/* Chats — only shown when a project is selected */}
				{currentProjectId && (
					<SidebarGroup>
						<SidebarGroupLabel>Chats</SidebarGroupLabel>
						<SidebarGroupAction
							title="New chat"
							onClick={onNewChat}
							disabled={!connectedToAI}
						>
							<Plus />
							<span className="sr-only">New chat</span>
						</SidebarGroupAction>
						<SidebarMenu className="mb-2 ml-2">
							{projectsLoading ? (
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
						</SidebarMenu>
					</SidebarGroup>
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
