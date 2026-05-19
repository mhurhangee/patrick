import type { AssetKind, AssetType } from "@patrickos/db"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
	BookOpen,
	CalendarDays,
	Check,
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Clock,
	Columns3,
	FolderOpen,
	FolderPlus,
	Gavel,
	Lightbulb,
	ListChecks,
	type LucideIcon,
	Pencil,
	Plus,
	Reply,
	Search,
	Settings,
	Sparkles,
	Trash2,
	UserCircle,
	X,
} from "lucide-react"
import * as React from "react"
import { usePanelRef } from "react-resizable-panels"
import { Logo } from "@/components/logo"
import { useTheme } from "@/components/theme-provider"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarSeparator,
	SidebarTrigger,
} from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"
import { type ApiAsset, api } from "@/lib/api"
import { formatDisplayDate } from "@/lib/dates"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/workspace/")({
	component: WorkspacePage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
	id: string
	role: "user" | "assistant"
	content: string
}

interface Project {
	id: string
	name: string
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const ASSET_TYPES: {
	id: AssetType
	kind: AssetKind
	label: string
	icon: LucideIcon
	color: string
}[] = [
		{
			id: "inventor-disclosure",
			kind: "source",
			label: "Inventor Disclosures",
			icon: Lightbulb,
			color: "text-amber-500",
		},
		{
			id: "office-action",
			kind: "source",
			label: "Office Actions",
			icon: Gavel,
			color: "text-red-500",
		},
		{
			id: "prior-art",
			kind: "source",
			label: "Prior Art",
			icon: Search,
			color: "text-slate-500",
		},
		{
			id: "patent-spec",
			kind: "artifact",
			label: "Patent Specifications",
			icon: BookOpen,
			color: "text-blue-500",
		},
		{
			id: "claims-draft",
			kind: "artifact",
			label: "Claims Drafts",
			icon: ListChecks,
			color: "text-green-500",
		},
		{
			id: "response-draft",
			kind: "artifact",
			label: "Response Drafts",
			icon: Reply,
			color: "text-violet-500",
		},
	]

const INITIAL_MESSAGES: Message[] = [
	{
		id: "1",
		role: "user",
		content: "Draft a response to the §103 rejection for claims 1–4.",
	},
	{
		id: "2",
		role: "assistant",
		content:
			"Smith doesn't disclose applying the transformation before transmission — claim 1 is distinguishable on that basis. Want me to draft the traversal argument?",
	},
	{
		id: "3",
		role: "user",
		content: "Yes, and amend claim 3 to narrow the training data.",
	},
	{
		id: "4",
		role: "assistant",
		content: "Drafting now — I'll open the response as a new tab when ready.",
	},
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<AssetKind, string> = {
	source: "Sources",
	artifact: "Artifacts",
}

function groupAssetsByKindAndType(assets: ApiAsset[]) {
	const result: {
		kind: AssetKind
		label: string
		types: {
			type: AssetType
			label: string
			icon: LucideIcon
			color: string
			assets: ApiAsset[]
		}[]
	}[] = []
	for (const kind of ["source", "artifact"] as AssetKind[]) {
		const types: {
			type: AssetType
			label: string
			icon: LucideIcon
			color: string
			assets: ApiAsset[]
		}[] = []
		for (const { id, label, icon, color } of ASSET_TYPES) {
			const typeAssets = assets
				.filter((a) => a.kind === kind && a.type === id)
				.sort((a, b) => a.date.localeCompare(b.date))
			if (typeAssets.length > 0)
				types.push({ type: id, label, icon, color, assets: typeAssets })
		}
		result.push({ kind, label: KIND_LABELS[kind], types })
	}
	return result
}

function AssetTypeIcon({
	type,
	size = 13,
}: {
	type: AssetType
	size?: number
}) {
	const entry = ASSET_TYPES.find((t) => t.id === type)
	if (!entry) return null
	return <entry.icon size={size} className={cn("shrink-0", entry.color)} />
}

// ─── Projects sheet ───────────────────────────────────────────────────────────

function ProjectsSheet({
	open,
	onOpenChange,
	projects,
	currentId,
	loading,
	onSelect,
	onCreate,
	onRename,
	onDelete,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	projects: Project[]
	currentId: string
	loading: boolean
	onSelect: (id: string) => void
	onCreate: () => void
	onRename: (id: string, name: string) => void
	onDelete: (id: string) => void
}) {
	const [editingId, setEditingId] = React.useState<string | null>(null)
	const [editingName, setEditingName] = React.useState("")

	function commitRename() {
		if (editingId && editingName.trim()) onRename(editingId, editingName.trim())
		setEditingId(null)
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="left">
				<SheetHeader>
					<SheetTitle>Projects</SheetTitle>
					<SheetDescription>
						Switch, create, rename, or delete projects.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-col gap-1 px-4 pt-4">
					{loading && (
						<p className="text-sm text-muted-foreground px-2">Loading…</p>
					)}
					{!loading && projects.length === 0 && (
						<Empty className="border-dashed py-8">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<FolderOpen />
								</EmptyMedia>
								<EmptyTitle>No projects yet</EmptyTitle>
								<EmptyDescription>
									Create your first project to get started.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button
									variant="outline"
									size="sm"
									className="gap-2"
									onClick={onCreate}
								>
									<Plus size={13} />
									Create project
								</Button>
							</EmptyContent>
						</Empty>
					)}
					{projects.map((p) => (
						<div key={p.id} className="group flex items-center gap-1">
							{editingId === p.id ? (
								<Input
									value={editingName}
									onChange={(e) => setEditingName(e.target.value)}
									onBlur={commitRename}
									onKeyDown={(e) => {
										if (e.key === "Enter") commitRename()
										if (e.key === "Escape") setEditingId(null)
									}}
									autoFocus
									className="flex-1"
								/>
							) : (
								<Button
									variant="ghost"
									onClick={() => {
										onSelect(p.id)
										onOpenChange(false)
									}}
									className="flex flex-1 items-center gap-2 justify-start h-auto"
								>
									{p.id === currentId ? (
										<Check size={13} className="shrink-0 text-primary" />
									) : (
										<span className="size-[13px] shrink-0" />
									)}
									<span className="truncate">{p.name}</span>
								</Button>
							)}
							<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => {
										setEditingId(p.id)
										setEditingName(p.name)
									}}
								>
									<Pencil />
								</Button>
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button
											variant="ghost"
											size="icon-xs"
											className="text-destructive hover:text-destructive"
										>
											<Trash2 size={12} />
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent size="sm">
										<AlertDialogHeader>
											<AlertDialogTitle>Delete project?</AlertDialogTitle>
											<AlertDialogDescription>
												"{p.name}" and all its assets will be permanently
												deleted.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												variant="destructive"
												onClick={() => onDelete(p.id)}
											>
												Delete
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						</div>
					))}
				</div>

				{projects.length > 0 && (
					<div className="px-4 pt-3">
						<Button
							variant="outline"
							size="sm"
							className="w-full gap-2"
							onClick={onCreate}
						>
							<Plus size={13} />
							New project
						</Button>
					</div>
				)}
			</SheetContent>
		</Sheet>
	)
}

// ─── Auth sheet ───────────────────────────────────────────────────────────────

function AuthSheet({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="left">
				<SheetHeader>
					<SheetTitle>Account</SheetTitle>
					<SheetDescription>Manage your account.</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 px-4 pt-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
							<UserCircle size={20} className="text-primary" />
						</div>
						<div>
							<p className="text-sm font-medium">Demo User</p>
							<p className="text-sm text-muted-foreground">user@firm.com</p>
						</div>
					</div>
					<Separator />
					<p className="text-sm text-muted-foreground">
						Authentication is available in cloud and self-hosted deployments.
					</p>
					<Button variant="outline" size="sm" disabled>
						Sign out
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	)
}

// ─── Settings sheet ───────────────────────────────────────────────────────────

function SettingsSheet({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
}) {
	const { theme, setTheme } = useTheme()

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="left">
				<SheetHeader>
					<SheetTitle>Settings</SheetTitle>
					<SheetDescription>Manage your settings.</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-5 px-4 pt-4">
					<div className="flex flex-col gap-2">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
							Appearance
						</p>
						<Select
							value={theme}
							onValueChange={(v) => setTheme(v as "light" | "dark" | "system")}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="light">Light</SelectItem>
								<SelectItem value="dark">Dark</SelectItem>
								<SelectItem value="system">System</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
							API URL
						</p>
						<Input placeholder="http://localhost:3000" disabled />
						<p className="text-xs text-muted-foreground">
							Configurable in local and self-hosted deployments.
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
							AI Model
						</p>
						<Select disabled>
							<SelectTrigger>
								<SelectValue placeholder="Ollama (local)" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ollama">Ollama (local)</SelectItem>
								<SelectItem value="anthropic">Anthropic</SelectItem>
								<SelectItem value="openai">OpenAI</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Model selection available in future releases.
						</p>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	)
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function AppSidebar({
	assets,
	openTabIds,
	projects,
	projectsLoading,
	currentProjectId,
	onOpen,
	onEdit,
	onAddArtifact,
	onAddSource,
	onManageProjects,
	onAuthOpen,
	onSettingsOpen,
}: {
	assets: ApiAsset[]
	openTabIds: string[]
	projects: Project[]
	projectsLoading: boolean
	currentProjectId: string
	onOpen: (id: string) => void
	onEdit: (id: string) => void
	onAddArtifact: () => void
	onAddSource: () => void
	onManageProjects: () => void
	onAuthOpen: () => void
	onSettingsOpen: () => void
}) {
	const openSet = new Set(openTabIds)
	const kindGroups = groupAssetsByKindAndType(assets)
	const currentProject = projects.find((p) => p.id === currentProjectId)

	return (
		<Sidebar variant="inset">
			<SidebarHeader className="px-3 py-2 gap-0">
				<div className="flex items-center justify-between py-1">
					<Link to="/" className="flex items-center gap-2">
						<Logo size={20} />
						<span className="font-heading font-semibold tracking-tight text-xl">
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
					<span className="flex items-center gap-1">
						{currentProject ? (
							<FolderOpen size={13} className="text-muted-foreground shrink-0" />
						) : (
							<FolderPlus size={13} className="text-muted-foreground shrink-0" />
						)}
						{projectsLoading ? "Loading…" : (currentProject?.name ?? "Select project")}
					</span>
					<ChevronsUpDown size={11} className="text-muted-foreground shrink-0" />
				</Button>

			</SidebarHeader>

			<SidebarContent>
				{kindGroups.map((kindGroup) => (
					<SidebarGroup key={kindGroup.kind}>
						<SidebarGroupLabel>{kindGroup.label}</SidebarGroupLabel>
						<SidebarGroupAction
							title={kindGroup.kind === "source" ? "Add source" : "New artifact"}
							onClick={kindGroup.kind === "source" ? onAddSource : onAddArtifact}
						>
							<Plus />
							<span className="sr-only">
								{kindGroup.kind === "source" ? "Add source" : "New artifact"}
							</span>
						</SidebarGroupAction>
						<SidebarMenu>
							{kindGroup.types.length === 0 && (
								<p className="px-3 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
									No {kindGroup.label.toLowerCase()} yet.
								</p>
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
												<span className="uppercase tracking-widest">{typeGroup.label}</span>
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
			</SidebarContent>

			<SidebarFooter className="p-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<div className="flex items-center gap-1">
							<SidebarMenuButton
								onClick={onAuthOpen}
								className="flex-1 gap-2 text-xs text-muted-foreground"
								tooltip="Account"
							>
								<UserCircle size={14} />
								<span>Demo User</span>
							</SidebarMenuButton>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={onSettingsOpen}
								className="shrink-0 group-data-[collapsible=icon]:hidden"
							>
								<Settings size={14} />
							</Button>
						</div>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}

// ─── Asset pane ────────────────────────────────────────────────────────────────

function AssetPane({ asset }: { asset: ApiAsset }) {
	return (
		<ScrollArea className="h-full w-full">
			<div className="mx-auto max-w-2xl px-8 py-6">
				<div className="flex items-center gap-2 mb-6">
					<AssetTypeIcon type={asset.type} size={15} />
					<h1 className="font-medium truncate">{asset.title}</h1>
					{asset.date && (
						<span className="text-xs ml-auto text-muted-foreground">
							{asset.date}
						</span>
					)}
				</div>
				<div className="h-96 rounded-lg bg-muted" />
			</div>
		</ScrollArea>
	)
}

// ─── Asset meta sheet ──────────────────────────────────────────────────────────

type AssetSheetState =
	| { mode: "closed" }
	| { mode: "create"; kind: AssetKind }
	| { mode: "edit"; assetId: string }

function AssetMetaSheet({
	state,
	asset,
	projectId,
	onClose,
	onCreated,
	onUpdated,
	onDeleted,
}: {
	state: AssetSheetState
	asset: ApiAsset | undefined
	projectId: string
	onClose: () => void
	onCreated: (asset: ApiAsset) => void
	onUpdated: (asset: ApiAsset) => void
	onDeleted: (id: string) => void
}) {
	const kind =
		state.mode === "create"
			? state.kind
			: state.mode === "edit" && asset
				? asset.kind
				: "artifact"
	const defaultType =
		ASSET_TYPES.find((t) => t.kind === kind)?.id ?? "claims-draft"

	const [title, setTitle] = React.useState("")
	const [type, setType] = React.useState<AssetType>(defaultType)
	const [date, setDate] = React.useState("")
	const [notes, setNotes] = React.useState("")
	const [saving, setSaving] = React.useState(false)

	const stateKey =
		state.mode === "edit" ? state.assetId : state.mode === "create" ? `create-${state.kind}` : null

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only sync on open/switch
	React.useEffect(() => {
		if (state.mode === "closed") return
		if (state.mode === "create") {
			setTitle("")
			setType(defaultType)
			setDate("")
			setNotes("")
		} else if (asset) {
			setTitle(asset.title)
			setType(asset.type)
			setDate(asset.date)
			setNotes(asset.notes)
		}
	}, [stateKey])

	async function handleSave() {
		setSaving(true)
		try {
			if (state.mode === "create") {
				const created = await api.assets.create({
					projectId,
					title: title.trim() || "Untitled",
					kind,
					type,
					date,
					notes,
				})
				onCreated(created)
			} else if (state.mode === "edit" && asset) {
				const updated = await api.assets.update(asset.id, {
					title: title.trim() || "Untitled",
					type,
					date,
					notes,
				})
				onUpdated(updated)
			}
			onClose()
		} finally {
			setSaving(false)
		}
	}

	const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined

	return (
		<Sheet open={state.mode !== "closed"} onOpenChange={(v) => { if (!v) onClose() }}>
			<SheetContent side="left">
				<SheetHeader>
					<SheetTitle>
						{state.mode === "create"
							? `New ${kind === "source" ? "Source" : "Artifact"}`
							: (asset?.title ?? "")}
					</SheetTitle>
					<SheetDescription>
						{state.mode === "create"
							? "Configure your new asset, then save."
							: "Edit asset details, then save."}
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-5 px-4 pt-4">
					<FieldGroup className="gap-3">
						<Field>
							<FieldLabel className="text-xs font-medium text-muted-foreground">
								Title
							</FieldLabel>
							<Input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Untitled"
							/>
						</Field>
						<Field>
							<FieldLabel className="text-xs font-medium text-muted-foreground">
								Type
							</FieldLabel>
							<Select
								value={type}
								onValueChange={(v) => setType(v as AssetType)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ASSET_TYPES.filter((at) => at.kind === kind).map((at) => (
										<SelectItem key={at.id} value={at.id}>
											{at.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel className="text-xs font-medium text-muted-foreground">
								Date
							</FieldLabel>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className="w-full justify-start font-normal"
									>
										<CalendarDays className="mr-1 text-muted-foreground" />
										{formatDisplayDate(date)}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0" align="start">
									<Calendar
										mode="single"
										selected={selectedDate}
										onSelect={(d) => {
											if (!d) return
											setDate(d.toISOString().split("T")[0])
										}}
									/>
								</PopoverContent>
							</Popover>
						</Field>
						<Field>
							<FieldLabel className="text-xs font-medium text-muted-foreground">
								Notes
							</FieldLabel>
							<Textarea
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								className="resize-none"
								placeholder="Add notes…"
							/>
						</Field>
					</FieldGroup>

					<Button onClick={handleSave} disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>

					{state.mode === "edit" && asset && (
						<>
							<Separator />
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="destructive" size="sm" className="gap-1.5">
										<Trash2 size={14} />
										Delete asset
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>Delete asset?</AlertDialogTitle>
										<AlertDialogDescription>
											"{asset.title}" will be permanently removed.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={() => {
												onDeleted(asset.id)
												onClose()
											}}
										>
											Delete
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}

// ─── Asset viewer ─────────────────────────────────────────────────────────────

function AssetViewer({
	assets,
	openTabIds,
	activeTab,
	splitView,
	onTabClick,
	onTabClose,
	onSplitToggle,
	onChatToggle,
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
	chatCollapsed: boolean
}) {
	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]
	const activeAsset =
		openAssets.find((a) => a.id === activeTab) ?? openAssets[0]

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="relative flex h-10 shrink-0 items-end bg-muted">
				{/* border line — tabs with z-10 render on top of it */}
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />
				<div className="relative z-10 flex shrink-0 items-center self-stretch px-2">
					<SidebarTrigger className="h-6 w-6" />
				</div>
				<div className="flex flex-1 items-end gap-0.5 overflow-x-auto px-1">
					{openAssets.map((asset) => (
						<div
							key={asset.id}
							className={cn(
								"relative group flex shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
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
								<AssetTypeIcon type={asset.type} />
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
								<Columns3 /> Split
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
				<div className="flex flex-1 items-center justify-center">
					<Empty className="max-w-xs border-0">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FolderOpen />
							</EmptyMedia>
							<EmptyTitle>Nothing open</EmptyTitle>
							<EmptyDescription>
								Select an asset from the sidebar to open it here.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
			) : splitView && openAssets.length > 1 ? (
				<ResizablePanelGroup orientation="horizontal" className="flex-1">
					{openAssets.map((asset, i) => (
						<React.Fragment key={asset.id}>
							{i > 0 && <ResizableHandle withHandle />}
							<ResizablePanel
								defaultSize={`${100 / openAssets.length}%`}
								collapsible
								collapsedSize="0%"
								minSize="10%"
							>
								<AssetPane key={asset.id} asset={asset} />
							</ResizablePanel>
						</React.Fragment>
					))}
				</ResizablePanelGroup>
			) : (
				<div className="flex-1 overflow-hidden">
					{activeAsset && (
						<AssetPane key={activeAsset.id} asset={activeAsset} />
					)}
				</div>
			)}
		</div>
	)
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function Chat({
	openAssets,
	onRemoveAsset,
}: {
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
}) {
	const [messages, setMessages] = React.useState<Message[]>(INITIAL_MESSAGES)
	const [input, setInput] = React.useState("")

	function send() {
		if (!input.trim()) return
		setMessages((m) => [
			...m,
			{ id: Date.now().toString(), role: "user", content: input },
		])
		setInput("")
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="relative flex h-10 shrink-0 items-end bg-muted px-1">
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />
				<div className="relative z-10 flex items-center gap-1.5 rounded-t-md border border-b-0 border-border bg-background px-2.5 py-1.5 text-xs font-medium">
					<Sparkles size={12} className="text-primary" />
					AgentPat
				</div>
				<div className="relative z-10 ml-auto flex items-center self-stretch">
					<Button variant="ghost" size="icon-xs">
						<Plus />
					</Button>
				</div>
			</div>
			<ScrollArea className="flex-1 px-3 py-3">
				<div className="space-y-4">
					{messages.map((msg) => (
						<div
							key={msg.id}
							className={cn(
								"flex flex-col gap-1",
								msg.role === "user" ? "items-end" : "items-start",
							)}
						>
							<div
								className={cn(
									"max-w-[88%] rounded-lg px-3 py-2 text-sm",
									msg.role === "user"
										? "bg-primary/10 text-foreground"
										: "text-foreground",
								)}
							>
								{msg.content}
							</div>
						</div>
					))}
				</div>
			</ScrollArea>
			<div className="shrink-0 space-y-2 p-3">
				{openAssets.length > 0 && (
					<div className="flex flex-wrap items-center gap-1">
						<span className="shrink-0 text-xs text-muted-foreground">
							In context:
						</span>
						{openAssets.map((asset) => (
							<span
								key={asset.id}
								className="flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
							>
								{asset.title}
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => onRemoveAsset(asset.id)}
									className="h-auto w-auto p-0 hover:bg-transparent"
								>
									<X size={9} />
								</Button>
							</span>
						))}
					</div>
				)}
				<div className="rounded-lg border focus-within:ring-1 focus-within:ring-ring">
					<Textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								send()
							}
						}}
						placeholder="Ask about open assets…"
						className="min-h-[64px] resize-none border-0 bg-transparent p-3 text-sm shadow-none focus-visible:ring-0"
					/>
					<div className="flex justify-end px-3 pb-2">
						<Button size="sm" onClick={send}>
							Send
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function WorkspacePage() {
	const [assets, setAssets] = React.useState<ApiAsset[]>([])
	const [openTabIds, setOpenTabIds] = React.useState<string[]>([])
	const [activeTab, setActiveTab] = React.useState("")

	const [splitView, setSplitView] = React.useState(false)
	const [chatCollapsed, setChatCollapsed] = React.useState(false)
	const [projects, setProjects] = React.useState<Project[]>([])
	const [projectsLoading, setProjectsLoading] = React.useState(true)
	const [currentProjectId, setCurrentProjectId] = React.useState("")
	const [projectsOpen, setProjectsOpen] = React.useState(false)
	const [authOpen, setAuthOpen] = React.useState(false)
	const [settingsOpen, setSettingsOpen] = React.useState(false)
	const [assetSheet, setAssetSheet] = React.useState<AssetSheetState>({ mode: "closed" })
	const chatPanelRef = usePanelRef()

	React.useEffect(() => {
		api.projects
			.list()
			.then((data) => {
				setProjects(data)
				if (data.length > 0) setCurrentProjectId(data[0].id)
			})
			.finally(() => setProjectsLoading(false))
	}, [])

	React.useEffect(() => {
		if (!currentProjectId) return
		setAssets([])
		setOpenTabIds([])
		setActiveTab("")
		api.assets.list(currentProjectId).then(setAssets)
	}, [currentProjectId])

	function openAsset(id: string) {
		setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
		setActiveTab(id)
	}

	function closeTab(id: string) {
		setOpenTabIds((prev) => {
			const next = prev.filter((t) => t !== id)
			if (activeTab === id) setActiveTab(next[0] ?? "")
			if (next.length < 2) setSplitView(false)
			return next
		})
	}

	async function deleteAsset(id: string) {
		await api.assets.delete(id)
		closeTab(id)
		setAssets((prev) => prev.filter((a) => a.id !== id))
	}

	function addArtifact() {
		if (!currentProjectId) return
		setAssetSheet({ mode: "create", kind: "artifact" })
	}

	function addSource() {
		if (!currentProjectId) return
		setAssetSheet({ mode: "create", kind: "source" })
	}

	async function createProject() {
		const project = await api.projects.create("New Project")
		setProjects((prev) => [...prev, project])
		setCurrentProjectId(project.id)
	}

	async function renameProject(id: string, name: string) {
		const updated = await api.projects.rename(id, name)
		setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)))
	}

	async function deleteProject(id: string) {
		await api.projects.delete(id)
		setProjects((prev) => {
			const next = prev.filter((p) => p.id !== id)
			if (currentProjectId === id) setCurrentProjectId(next[0]?.id ?? "")
			return next
		})
		if (currentProjectId === id) {
			setAssets([])
			setOpenTabIds([])
			setActiveTab("")
		}
	}

	function toggleChat() {
		const panel = chatPanelRef.current
		if (!panel) return
		if (chatCollapsed) {
			panel.expand()
			setChatCollapsed(false)
		} else {
			panel.collapse()
			setChatCollapsed(true)
		}
	}

	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]

	return (
		<>
			<SidebarProvider>
				<AppSidebar
					assets={assets}
					openTabIds={openTabIds}
					projects={projects}
					projectsLoading={projectsLoading}
					currentProjectId={currentProjectId}
					onOpen={openAsset}
					onEdit={(id) => setAssetSheet({ mode: "edit", assetId: id })}
					onAddArtifact={addArtifact}
					onAddSource={addSource}
					onManageProjects={() => setProjectsOpen(true)}
					onAuthOpen={() => setAuthOpen(true)}
					onSettingsOpen={() => setSettingsOpen(true)}
				/>
				<SidebarInset className="flex flex-col overflow-hidden">
					<ResizablePanelGroup
						orientation="horizontal"
						className="flex-1 overflow-hidden"
					>
						<ResizablePanel defaultSize="68%" minSize="30%">
							<AssetViewer
								assets={assets}
								openTabIds={openTabIds}
								activeTab={activeTab}
								splitView={splitView}
								onTabClick={(id) => {
									setActiveTab(id)
									setSplitView(false)
								}}
								onTabClose={closeTab}
								onSplitToggle={() => setSplitView((v) => !v)}
								onChatToggle={toggleChat}
								chatCollapsed={chatCollapsed}
							/>
						</ResizablePanel>
						<ResizableHandle withHandle className="w-[3px] before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-muted before:content-['']" />
						<ResizablePanel
							panelRef={chatPanelRef}
							defaultSize="32%"
							minSize="20%"
							maxSize="50%"
							collapsible
							collapsedSize="0%"
							style={{ transition: "flex 150ms ease" }}
						>
							<Chat openAssets={openAssets} onRemoveAsset={closeTab} />
						</ResizablePanel>
					</ResizablePanelGroup>
				</SidebarInset>
			</SidebarProvider>
			<ProjectsSheet
				open={projectsOpen}
				onOpenChange={setProjectsOpen}
				projects={projects}
				currentId={currentProjectId}
				loading={projectsLoading}
				onSelect={setCurrentProjectId}
				onCreate={createProject}
				onRename={renameProject}
				onDelete={deleteProject}
			/>
			<AuthSheet open={authOpen} onOpenChange={setAuthOpen} />
			<SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
			<AssetMetaSheet
				state={assetSheet}
				asset={assetSheet.mode === "edit" ? assets.find((a) => a.id === assetSheet.assetId) : undefined}
				projectId={currentProjectId}
				onClose={() => setAssetSheet({ mode: "closed" })}
				onCreated={(asset) => {
					setAssets((prev) => [...prev, asset])
					openAsset(asset.id)
				}}
				onUpdated={(asset) => {
					setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)))
				}}
				onDeleted={deleteAsset}
			/>
		</>
	)
}
