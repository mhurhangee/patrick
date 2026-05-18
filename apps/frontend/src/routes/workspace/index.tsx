import type { AssetKind, AssetType } from "@patrickos/db"
import { createFileRoute } from "@tanstack/react-router"
import {
	CalendarDays,
	Check,
	ChevronDown,
	CloudUpload,
	Columns3,
	File,
	FilePen,
	FilePlus,
	FolderOpen,
	PanelRight,
	Pencil,
	Plus,
	Settings,
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
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"
import { type ApiAsset, api } from "@/lib/api"
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

const ASSET_TYPES: { id: AssetType; label: string }[] = [
	{ id: "inventor-disclosure", label: "Inventor Disclosures" },
	{ id: "office-action", label: "Office Actions" },
	{ id: "patent-spec", label: "Patent Specification" },
	{ id: "prior-art", label: "Prior Art" },
	{ id: "claims-draft", label: "Claims Drafts" },
	{ id: "response-draft", label: "Response Drafts" },
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

function groupAssetsByType(assets: ApiAsset[]) {
	const groups: { type: AssetType; label: string; assets: ApiAsset[] }[] = []
	for (const { id, label } of ASSET_TYPES) {
		const typeAssets = assets
			.filter((a) => a.type === id)
			.sort((a, b) => a.date.localeCompare(b.date))
		if (typeAssets.length > 0)
			groups.push({ type: id, label, assets: typeAssets })
	}
	return groups
}

function formatShortDate(date: string): string {
	if (!date) return ""
	const d = new Date(`${date}T00:00:00`)
	const month = d.toLocaleDateString("en-US", { month: "short" })
	const year = d.toLocaleDateString("en-US", { year: "2-digit" })
	return `${month} '${year}`
}

function formatDisplayDate(date: string): string {
	if (!date) return "Pick a date"
	const d = new Date(`${date}T00:00:00`)
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
}

// ─── Asset kind icon ───────────────────────────────────────────────────────────

function AssetKindIcon({
	kind,
	size = 13,
}: {
	kind: AssetKind
	size?: number
}) {
	if (kind === "source")
		return <File size={size} className="shrink-0 text-red-500" />
	return <FilePen size={size} className="shrink-0 text-amber-500" />
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
						Here you can change, create, and delete your projects.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-col gap-1 px-4 pt-4">
					{loading && <p className="text-xs text-muted-foreground">Loading…</p>}
					{!loading && projects.length === 0 && (
						<p className="text-xs text-muted-foreground">No projects yet.</p>
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
									className="h-7 flex-1 text-xs"
								/>
							) : (
								<Button
									variant="ghost"
									onClick={() => {
										onSelect(p.id)
										onOpenChange(false)
									}}
									className="flex flex-1 items-center gap-2 justify-start px-2 py-1.5 h-auto text-sm"
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
									<Pencil size={12} />
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
				<div className="px-4 pt-4">
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
					<SheetDescription>Here you can manage your account.</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 px-4 pt-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
							<UserCircle size={20} className="text-primary" />
						</div>
						<div>
							<p className="text-sm font-medium">Demo User</p>
							<p className="text-xs text-muted-foreground">user@firm.com</p>
						</div>
					</div>
					<Separator />
					<p className="text-xs text-muted-foreground">
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

const LABEL_CLASS_SHEET =
	"text-[10px] uppercase tracking-widest text-muted-foreground"

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
					<SheetDescription>
						Here you can manage your settings.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-5 px-4 pt-4">
					<div className="flex flex-col gap-2">
						<span className={LABEL_CLASS_SHEET}>Appearance</span>
						<Select
							value={theme}
							onValueChange={(v) => setTheme(v as "light" | "dark" | "system")}
						>
							<SelectTrigger size="sm" className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="light" className="text-xs">
									Light
								</SelectItem>
								<SelectItem value="dark" className="text-xs">
									Dark
								</SelectItem>
								<SelectItem value="system" className="text-xs">
									System
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2">
						<span className={LABEL_CLASS_SHEET}>API URL</span>
						<Input
							placeholder="http://localhost:3000"
							className="h-7 text-xs"
							disabled
						/>
						<p className="text-[10px] text-muted-foreground">
							Configurable in local and self-hosted deployments.
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<span className={LABEL_CLASS_SHEET}>AI Model</span>
						<Select disabled>
							<SelectTrigger size="sm" className="h-7 text-xs">
								<SelectValue placeholder="Ollama (local)" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ollama" className="text-xs">
									Ollama (local)
								</SelectItem>
								<SelectItem value="anthropic" className="text-xs">
									Anthropic
								</SelectItem>
								<SelectItem value="openai" className="text-xs">
									OpenAI
								</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-[10px] text-muted-foreground">
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
	onAddArtifact: () => void
	onAddSource: () => void
	onManageProjects: () => void
	onAuthOpen: () => void
	onSettingsOpen: () => void
}) {
	const openSet = new Set(openTabIds)
	const groups = groupAssetsByType(assets)
	const currentProject = projects.find((p) => p.id === currentProjectId)

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="h-9 px-3">
				<div className="flex items-center gap-2">
					<div className="shrink-0">
						<Logo size={20} />
					</div>
					<Button
						onClick={onManageProjects}
						variant="ghost"
						className="group-data-[collapsible=icon]:hidden"
					>
						<FolderOpen size={12} className="shrink-0 text-muted-foreground" />
						<span className="flex-1 truncate text-left text-muted-foreground">
							{projectsLoading
								? "Loading…"
								: (currentProject?.name ?? "Projects")}
						</span>
					</Button>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{groups.map((group) => (
					<SidebarGroup key={group.type}>
						<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
						<SidebarMenu>
							{group.assets.map((asset) => (
								<SidebarMenuItem key={asset.id}>
									<SidebarMenuButton
										onClick={() => onOpen(asset.id)}
										isActive={openSet.has(asset.id)}
										className="gap-2 text-xs"
										tooltip={asset.title}
									>
										<AssetKindIcon kind={asset.kind} />
										<span className="truncate">{asset.title}</span>
										<span className="ml-auto shrink-0 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
											{formatShortDate(asset.date)}
										</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroup>
				))}
			</SidebarContent>

			<SidebarFooter className="p-2">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							onClick={onAddArtifact}
							className="gap-2 text-xs text-muted-foreground"
							tooltip="New artifact"
						>
							<FilePlus size={14} />
							<span>New artifact</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton
							onClick={onAddSource}
							className="gap-2 text-xs text-muted-foreground"
							tooltip="Add source"
						>
							<CloudUpload size={14} />
							<span>Add source</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
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

const LABEL_CLASS =
	"text-[10px] uppercase tracking-widest text-muted-foreground font-normal"

function AssetPane({
	asset,
	isNew,
	onUpdate,
	onDelete,
}: {
	asset: ApiAsset
	isNew: boolean
	onUpdate: (
		id: string,
		changes: Parameters<typeof api.assets.update>[1],
	) => void
	onDelete: (id: string) => void
}) {
	const [open, setOpen] = React.useState(isNew)
	const [title, setTitle] = React.useState(asset.title)
	const [type, setType] = React.useState<AssetType>(asset.type)
	const [date, setDate] = React.useState(asset.date)
	const [notes, setNotes] = React.useState(asset.notes)

	const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined

	return (
		<ScrollArea className="h-full w-full">
			<div className="mx-auto max-w-2xl px-8 py-6">
				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleTrigger asChild>
						<Button
							variant="ghost"
							className="flex w-full items-center gap-2 px-2 py-1.5 h-auto text-xs justify-start"
						>
							<AssetKindIcon kind={asset.kind} size={13} />
							<span className="flex-1 truncate text-left font-medium">
								{title}
							</span>
							<ChevronDown
								size={13}
								className={cn(
									"shrink-0 text-muted-foreground transition-transform",
									open && "rotate-180",
								)}
							/>
						</Button>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="mt-2 rounded-md border bg-muted/30 p-4">
							<FieldGroup className="gap-3">
								<Field>
									<FieldLabel className={LABEL_CLASS}>Title</FieldLabel>
									<Input
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										onBlur={() => onUpdate(asset.id, { title })}
										className="h-7 text-xs"
									/>
								</Field>
								<Field>
									<FieldLabel className={LABEL_CLASS}>Type</FieldLabel>
									<Select
										value={type}
										onValueChange={(v) => {
											const t = v as AssetType
											setType(t)
											onUpdate(asset.id, { type: t })
										}}
									>
										<SelectTrigger
											size="sm"
											className="h-7 w-full rounded-md text-xs"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{ASSET_TYPES.map((at) => (
												<SelectItem
													key={at.id}
													value={at.id}
													className="py-1.5 text-xs focus:bg-muted focus:text-foreground"
												>
													{at.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel className={LABEL_CLASS}>Date</FieldLabel>
									<Popover>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												size="sm"
												className="h-7 w-full justify-start rounded-md text-xs font-normal"
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
													const iso = d.toISOString().split("T")[0]
													setDate(iso)
													onUpdate(asset.id, { date: iso })
												}}
											/>
										</PopoverContent>
									</Popover>
								</Field>
								<Field>
									<FieldLabel className={LABEL_CLASS}>Notes</FieldLabel>
									<Textarea
										value={notes}
										onChange={(e) => setNotes(e.target.value)}
										onBlur={() => onUpdate(asset.id, { notes })}
										className="min-h-[60px] resize-none text-xs"
										placeholder="Add notes…"
									/>
								</Field>
							</FieldGroup>

							<Separator className="my-3" />

							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="destructive" size="xs" className="gap-1.5">
										<Trash2 />
										Delete asset
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>Delete asset?</AlertDialogTitle>
										<AlertDialogDescription>
											"{title}" will be permanently removed.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={() => onDelete(asset.id)}
										>
											Delete
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</CollapsibleContent>
				</Collapsible>

				<div className="mt-6 h-96 rounded-md bg-muted" />
			</div>
		</ScrollArea>
	)
}

// ─── Doc viewer ───────────────────────────────────────────────────────────────

function DocViewer({
	assets,
	openTabIds,
	activeTab,
	newAssetId,
	splitView,
	onTabClick,
	onTabClose,
	onSplitToggle,
	onChatToggle,
	onUpdateAsset,
	onDeleteAsset,
}: {
	assets: ApiAsset[]
	openTabIds: string[]
	activeTab: string
	newAssetId: string | null
	splitView: boolean
	onTabClick: (id: string) => void
	onTabClose: (id: string) => void
	onSplitToggle: () => void
	onChatToggle: () => void
	onUpdateAsset: (
		id: string,
		changes: Parameters<typeof api.assets.update>[1],
	) => void
	onDeleteAsset: (id: string) => void
}) {
	const openAssets = openTabIds
		.map((id) => assets.find((a) => a.id === id))
		.filter(Boolean) as ApiAsset[]
	const activeAsset =
		openAssets.find((a) => a.id === activeTab) ?? openAssets[0]

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="relative flex h-9 shrink-0 items-end bg-muted/30">
				<div className="absolute inset-x-0 bottom-0 h-px bg-border" />
				<div className="relative z-10 flex shrink-0 items-center self-stretch px-2">
					<SidebarTrigger className="h-6 w-6" />
				</div>
				<div className="flex flex-1 items-end gap-0.5 overflow-x-auto px-1">
					{openAssets.map((asset) => (
						<div
							key={asset.id}
							className={cn(
								"group flex shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
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
								<AssetKindIcon kind={asset.kind} />
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
				</div>
				<div className="flex shrink-0 items-end self-stretch px-1">
					<Button variant="ghost" size="icon" onClick={onChatToggle}>
						<PanelRight />
					</Button>
				</div>
			</div>

			{openAssets.length === 0 ? (
				<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
					Open an asset from the sidebar
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
								<AssetPane
									key={asset.id}
									asset={asset}
									isNew={asset.id === newAssetId}
									onUpdate={onUpdateAsset}
									onDelete={onDeleteAsset}
								/>
							</ResizablePanel>
						</React.Fragment>
					))}
				</ResizablePanelGroup>
			) : (
				<div className="flex-1 overflow-hidden">
					{activeAsset && (
						<AssetPane
							key={activeAsset.id}
							asset={activeAsset}
							isNew={activeAsset.id === newAssetId}
							onUpdate={onUpdateAsset}
							onDelete={onDeleteAsset}
						/>
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
		<div className="flex h-full flex-col overflow-hidden border-l border-border">
			<div className="flex h-9 shrink-0 items-center px-3">
				<span className="text-sm font-medium">Assistant</span>
			</div>
			<ScrollArea className="flex-1 bg-muted/20 px-3 py-3">
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
									"max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed text-foreground",
									msg.role === "user" && "bg-primary/10",
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
						<span className="shrink-0 text-[10px] text-muted-foreground">
							In context:
						</span>
						{openAssets.map((asset) => (
							<span
								key={asset.id}
								className="flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
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
				<div className="rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
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
						className="min-h-[64px] resize-none border-0 bg-transparent p-3 text-xs shadow-none focus-visible:ring-0"
					/>
					<div className="flex justify-end px-3 pb-2">
						<Button size="sm" className="h-7 text-xs" onClick={send}>
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
	const [newAssetId, setNewAssetId] = React.useState<string | null>(null)
	const [splitView, setSplitView] = React.useState(false)
	const [chatCollapsed, setChatCollapsed] = React.useState(false)
	const [projects, setProjects] = React.useState<Project[]>([])
	const [projectsLoading, setProjectsLoading] = React.useState(true)
	const [currentProjectId, setCurrentProjectId] = React.useState("")
	const [projectsOpen, setProjectsOpen] = React.useState(false)
	const [authOpen, setAuthOpen] = React.useState(false)
	const [settingsOpen, setSettingsOpen] = React.useState(false)
	const chatPanelRef = usePanelRef()

	// Load projects on mount
	React.useEffect(() => {
		api.projects
			.list()
			.then((data) => {
				setProjects(data)
				if (data.length > 0) setCurrentProjectId(data[0].id)
			})
			.finally(() => setProjectsLoading(false))
	}, [])

	// Load assets when project changes
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

	async function updateAsset(
		id: string,
		changes: Parameters<typeof api.assets.update>[1],
	) {
		const updated = await api.assets.update(id, changes)
		setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)))
	}

	async function deleteAsset(id: string) {
		await api.assets.delete(id)
		closeTab(id)
		setAssets((prev) => prev.filter((a) => a.id !== id))
	}

	async function addArtifact() {
		if (!currentProjectId) return
		const asset = await api.assets.create({
			projectId: currentProjectId,
			title: "New Artifact",
			type: "claims-draft",
			kind: "artifact",
		})
		setAssets((prev) => [...prev, asset])
		setNewAssetId(asset.id)
		openAsset(asset.id)
	}

	async function addSource() {
		if (!currentProjectId) return
		const asset = await api.assets.create({
			projectId: currentProjectId,
			title: "New Source",
			type: "inventor-disclosure",
			kind: "source",
		})
		setAssets((prev) => [...prev, asset])
		setNewAssetId(asset.id)
		openAsset(asset.id)
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
							<DocViewer
								assets={assets}
								openTabIds={openTabIds}
								activeTab={activeTab}
								newAssetId={newAssetId}
								splitView={splitView}
								onTabClick={(id) => {
									setActiveTab(id)
									setSplitView(false)
								}}
								onTabClose={closeTab}
								onSplitToggle={() => setSplitView((v) => !v)}
								onChatToggle={toggleChat}
								onUpdateAsset={updateAsset}
								onDeleteAsset={deleteAsset}
							/>
						</ResizablePanel>
						<ResizableHandle withHandle />
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
		</>
	)
}
