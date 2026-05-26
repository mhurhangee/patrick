import { Link } from "@tanstack/react-router"
import {
	ChevronRight,
	ChevronsUpDown,
	FolderOpen,
	FolderPlus,
	Loader2,
	Pencil,
	Plus,
	Settings,
} from "lucide-react"
import * as React from "react"
import type { Chat } from "@/components/chat-panel"
import { Logo } from "@/components/logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
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
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import type { ApiAsset } from "@/lib/api"
import { groupAssetsByKindAndType } from "@/lib/asset-config"
import { cn } from "@/lib/utils"

type Project = import("@/lib/api").ApiProject

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
	chats: Chat[]
	openChatIds: string[]
	projects: Project[]
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
	const kindGroups = groupAssetsByKindAndType(assets)
	const sortedChats = [...chats].sort(
		(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
	)
	const visibleChats = showAllChats
		? sortedChats
		: sortedChats.slice(0, CHAT_LIMIT)
	const currentProject = projects.find((p) => p.id === currentProjectId)

	return (
		<Sidebar variant="inset">
			<SidebarHeader className="gap-0 px-3 py-2">
				<div className="flex items-center justify-between py-1">
					<Link to="/" className="flex items-center gap-2">
						<Logo size={20} />
						<span className="font-heading text-xl font-semibold tracking-tight">
							PatrickOS
						</span>
					</Link>
					<a
						href="https://github.com/mhurhangee/patrickos"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Badge variant="secondary">Open Source</Badge>
					</a>
				</div>
				<div className="px-2 pb-2">
					<Separator className="my-1" />
				</div>

				<Button
					onClick={onManageProjects}
					variant="ghost"
					size="sm"
					className="w-full justify-between px-2 text-sm font-medium"
				>
					<span className="flex items-center gap-1.5">
						{projectsLoading ? (
							<Loader2
								size={13}
								className="shrink-0 animate-spin text-muted-foreground"
							/>
						) : currentProject ? (
							<FolderOpen
								size={13}
								className="shrink-0 text-muted-foreground"
							/>
						) : (
							<FolderPlus
								size={13}
								className="shrink-0 text-muted-foreground"
							/>
						)}
						{projectsLoading
							? "Loading…"
							: (currentProject?.name ?? "Select project")}
					</span>
					<ChevronsUpDown
						size={11}
						className="shrink-0 text-muted-foreground"
					/>
				</Button>
			</SidebarHeader>

			<SidebarContent>
				{/* Sources + Artifacts */}
				{kindGroups.map((kindGroup) => (
					<SidebarGroup key={kindGroup.kind}>
						<SidebarGroupLabel>{kindGroup.label}</SidebarGroupLabel>
						<SidebarGroupAction
							title={
								kindGroup.kind === "source" ? "Add source" : "New artifact"
							}
							onClick={
								kindGroup.kind === "source" ? onAddSource : onAddArtifact
							}
							disabled={!currentProjectId}
						>
							<Plus />
							<span className="sr-only">
								{kindGroup.kind === "source" ? "Add source" : "New artifact"}
							</span>
						</SidebarGroupAction>
						<SidebarMenu>
							{projectsLoading ? (
								<div className="flex flex-col gap-1.5 px-3 py-1 group-data-[collapsible=icon]:hidden">
									<Skeleton className="h-3 w-3/4" />
									<Skeleton className="h-3 w-1/2" />
								</div>
							) : (
								kindGroup.types.length === 0 && (
									<p className="px-3 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
										No {kindGroup.label.toLowerCase()} yet.
									</p>
								)
							)}
							{kindGroup.types.map((typeGroup) => (
								<Collapsible
									key={typeGroup.type}
									asChild
									defaultOpen
									className="group/collapsible"
								>
									<SidebarMenuItem>
										<CollapsibleTrigger asChild>
											<SidebarMenuButton
												className="text-xs"
												tooltip={typeGroup.label}
											>
												<typeGroup.icon
													size={13}
													className={cn("shrink-0", typeGroup.color)}
												/>
												<span className="uppercase tracking-widest">
													{typeGroup.label}
												</span>
												<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
											</SidebarMenuButton>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<SidebarMenuSub>
												{typeGroup.assets.map((asset) => (
													<SidebarMenuSubItem key={asset.id}>
														<SidebarMenuSubButton
															onClick={() => onOpen(asset.id)}
															isActive={openSet.has(asset.id)}
															className="gap-1.5"
														>
															<span className="truncate">{asset.title}</span>
														</SidebarMenuSubButton>
														<SidebarMenuAction
															className="opacity-0 transition-opacity group-hover/menu-sub-item:opacity-100"
															onClick={(e) => {
																e.stopPropagation()
																onEdit(asset.id)
															}}
														>
															<Pencil size={12} />
															<span className="sr-only">Edit asset</span>
														</SidebarMenuAction>
													</SidebarMenuSubItem>
												))}
											</SidebarMenuSub>
										</CollapsibleContent>
									</SidebarMenuItem>
								</Collapsible>
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
						<SidebarMenuSub>
							{visibleChats.map((chat) => (
								<SidebarMenuSubItem key={chat.id}>
									<SidebarMenuSubButton
										onClick={() => onOpenChat(chat.id)}
										isActive={openChatSet.has(chat.id)}
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
										<Pencil size={12} />
										<span className="sr-only">Edit chat</span>
									</SidebarMenuAction>
								</SidebarMenuSubItem>
							))}
							{sortedChats.length > CHAT_LIMIT && (
								<SidebarMenuSubItem>
									<SidebarMenuSubButton
										onClick={() => setShowAllChats((v) => !v)}
										className="justify-center text-muted-foreground"
									>
										{showAllChats
											? "Show less"
											: `${sortedChats.length - CHAT_LIMIT} older…`}
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							)}
						</SidebarMenuSub>
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="p-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							onClick={onSettingsOpen}
							className="gap-2 text-xs text-muted-foreground"
							tooltip={
								connectedToAI
									? "AI connected"
									: "AI not connected — click to configure"
							}
						>
							<div
								className={cn(
									"h-2 w-2 shrink-0 rounded-full",
									connectedToAI ? "bg-green-500" : "bg-muted-foreground/40",
								)}
							/>
							{connectedToAI ? "AI connected" : "AI not connected"}
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton onClick={onSettingsOpen} className="gap-2">
							<Settings size={14} />
							Settings
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}
