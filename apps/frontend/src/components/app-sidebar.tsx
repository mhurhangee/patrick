import { ASSET_CONFIGS } from "@patrickos/db"
import { Link } from "@tanstack/react-router"
import { ChevronsUpDown, Ellipsis, Plus, Settings2 } from "lucide-react"
import * as React from "react"
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
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import type { ApiAsset, ApiChat, ApiProject } from "@patrickos/db"
import { cn } from "@/lib/utils"

export function AppSidebar({
	assets,
	openTabIds,
	chats,
	openChatIds,
	projects,
	projectsLoading,
	currentProjectId,
	onOpen,
	onEdit,
	onAddArtifact,
	onAddSource,
	onOpenChat,
	onNewChat,
	onEditChat,
	onManageProjects,
	onSettingsOpen,
	connectedToAI,
}: {
	assets: ApiAsset[]
	openTabIds: string[]
	chats: ApiChat[]
	openChatIds: string[]
	projects: ApiProject[]
	projectsLoading: boolean
	currentProjectId: string
	onOpen: (id: string) => void
	onEdit: (id: string) => void
	onAddArtifact: () => void
	onAddSource: () => void
	onOpenChat: (id: string) => void
	onNewChat: () => void
	onEditChat: (id: string) => void
	onManageProjects: () => void
	onSettingsOpen: () => void
	connectedToAI: boolean
}) {
	const CHAT_LIMIT = 5
	const [showAllChats, setShowAllChats] = React.useState(false)

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
	const currentProject = projects.find((p) => p.id === currentProjectId)

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
						size="sm"
						className="text-sm shrink-0"
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
				{/* Sources + Artifacts */}
				{assetGroups.map(({ kind, label, items, onAdd, addLabel }) => (
					<SidebarGroup key={kind}>
						<SidebarGroupLabel>{label}</SidebarGroupLabel>
						<SidebarGroupAction
							title={addLabel}
							onClick={onAdd}
							disabled={!currentProjectId}
						>
							<Plus />
							<span className="sr-only">{addLabel}</span>
						</SidebarGroupAction>
						<SidebarMenu>
							{projectsLoading ? (
								<div className="flex flex-col gap-1.5 px-3 py-1 group-data-[collapsible=icon]:hidden">
									<Skeleton className="h-3 w-3/4" />
									<Skeleton className="h-3 w-1/2" />
								</div>
							) : (
								items.length === 0 && (
									<p className="px-3 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
										No {label.toLowerCase()} yet.
									</p>
								)
							)}
							{items.map((asset) => (
								<SidebarMenuSubItem key={asset.id}>
									<SidebarMenuAction
										className="opacity-0 transition-opacity group-hover/menu-sub-item:opacity-100"
										onClick={(e) => {
											e.stopPropagation()
											onEdit(asset.id)
										}}
									>
										<Ellipsis size={10} />
										<span className="sr-only">Edit asset</span>
									</SidebarMenuAction>
									<SidebarMenuSubButton
										onClick={() => onOpen(asset.id)}
										isActive={openSet.has(asset.id)}
										className="flex items-center items-center justify-between h-6 gap-1.5 mr-4 data-[active=true]:border-l-2 data-[active=true]:border-primary data-[active=true]:pl-2"
									>
										<span className="truncate">{asset.title}</span>
										<Badge
											variant="secondary"
											className="shrink-0 text-xxs font-normal bg-primary/5 border border-primary/10 uppercase tracking-wider"
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

				{/* Chats */}
				<SidebarGroup>
					<SidebarGroupLabel>Chats</SidebarGroupLabel>
					<SidebarGroupAction title="New chat" onClick={onNewChat}>
						<Plus />
						<span className="sr-only">New chat</span>
					</SidebarGroupAction>
					<SidebarMenu>
						{projectsLoading ? (
							<div className="flex flex-col gap-1.5 px-3 py-1 group-data-[collapsible=icon]:hidden">
								<Skeleton className="h-3 w-2/3" />
								<Skeleton className="h-3 w-1/2" />
								<Skeleton className="h-3 w-3/5" />
							</div>
						) : (
							sortedChats.length === 0 && (
								<p className="px-3 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
									No chats yet.
								</p>
							)
						)}
						{visibleChats.map((chat) => (
							<SidebarMenuSubItem key={chat.id}>
								<SidebarMenuSubButton
									onClick={() => onOpenChat(chat.id)}
									isActive={openChatSet.has(chat.id)}
									className="flex items-center items-center justify-between h-6 gap-1.5 mr-6 data-[active=true]:border-l-2 data-[active=true]:border-primary data-[active=true]:pl-2"
								>
									<span className="truncate">{chat.title}</span>
								</SidebarMenuSubButton>
								<SidebarMenuAction
									className="opacity-0 transition-opacity group-hover/menu-sub-item:opacity-100"
									onClick={(e) => {
										e.stopPropagation()
										onEditChat(chat.id)
									}}
								>
									<Ellipsis size={10} />
									<span className="sr-only">Edit chat</span>
								</SidebarMenuAction>
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
						<SidebarMenuItem>
							<SidebarMenuButton onClick={onSettingsOpen} className="gap-2">
								<Settings2 size={14} />
							</SidebarMenuButton>
						</SidebarMenuItem>
					</div>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}
