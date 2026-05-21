import type { AssetKind, AssetType } from "@patrickos/db"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
	BookOpen,
	CalendarDays,
	Check,
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Clover,
	Columns3,
	Eye,
	EyeOff,
	FolderOpen,
	FolderPlus,
	Gavel,
	Lightbulb,
	ListChecks,
	Loader2,
	type LucideIcon,
	MessageSquare,
	Pencil,
	Plus,
	Reply,
	Search,
	Send,
	Settings,
	Trash2,
	UserCircle,
	X,
} from "lucide-react"
import type { Value } from "platejs"
import * as React from "react"
import { usePanelRef } from "react-resizable-panels"
import { PlateEditor } from "@/components/editor/plate-editor"
import { Logo } from "@/components/logo"
import { SourceViewer } from "@/components/source-viewer"
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
	SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
	DEFAULT_DETAILED_MODEL,
	DEFAULT_QUICK_MODEL,
	type GatewayModel,
} from "@/lib/ai-models"
import { type ApiAsset, api, BASE_URL } from "@/lib/api"
import { formatDisplayDate } from "@/lib/dates"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/workspace/")({
	component: WorkspacePage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

type KeyStatus = "idle" | "verifying" | "valid" | "invalid"

interface Message {
	id: string
	role: "user" | "assistant"
	content: string
}

interface Project {
	id: string
	name: string
}

interface Chat {
	id: string
	title: string
	messages: Message[]
	createdAt: Date
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

const AGENTPAT_SUGGESTIONS = [
	"Draft a §103 response",
	"Search prior art",
	"Amend claims",
]

// Dates relative to module load — fine for mock data
const _now = new Date()
const _d = (daysAgo: number) =>
	new Date(
		_now.getFullYear(),
		_now.getMonth(),
		_now.getDate() - daysAgo,
		10,
		30,
	)

const MOCK_CHATS: Chat[] = [
	{
		id: "mock-1",
		title: "§103 rejection response strategy",
		messages: [
			{
				id: "m1",
				role: "user",
				content: "Draft a response to the §103 rejection for claims 1–4.",
			},
			{
				id: "m2",
				role: "assistant",
				content:
					"Smith doesn't disclose applying the transformation before transmission — claim 1 is distinguishable on that basis. Want me to draft the traversal argument?",
			},
			{
				id: "m3",
				role: "user",
				content: "Yes, and amend claim 3 to narrow the training data.",
			},
			{
				id: "m4",
				role: "assistant",
				content:
					"Drafting now — I'll open the response as a new tab when ready.",
			},
		],
		createdAt: _d(0),
	},
	{
		id: "mock-2",
		title: "Prior art search for claim 1",
		messages: [
			{
				id: "m5",
				role: "user",
				content: "Can you find prior art for the data compression claims?",
			},
			{
				id: "m6",
				role: "assistant",
				content:
					"I'll analyse the key claim elements and suggest relevant search strategies.",
			},
		],
		createdAt: _d(1),
	},
	{
		id: "mock-3",
		title: "Claims 1–4 amendment draft",
		messages: [],
		createdAt: _d(3),
	},
	{
		id: "mock-4",
		title: "Client response to office action",
		messages: [],
		createdAt: _d(10),
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
	savedApiKey,
	keyStatus,
	savedQuickModel,
	savedDetailedModel,
	onVerify,
	onSave,
	onClear,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	savedApiKey: string
	keyStatus: KeyStatus
	savedQuickModel: string
	savedDetailedModel: string
	onVerify: (key: string) => void
	onSave: (key: string, quickModel: string, detailedModel: string) => void
	onClear: () => void
}) {
	const { theme, setTheme } = useTheme()
	const [tempKey, setTempKey] = React.useState(savedApiKey)
	const [tempQuickModel, setTempQuickModel] = React.useState(savedQuickModel)
	const [tempDetailedModel, setTempDetailedModel] =
		React.useState(savedDetailedModel)
	const [showKey, setShowKey] = React.useState(false)
	const [models, setModels] = React.useState<GatewayModel[]>([])
	const [modelsLoading, setModelsLoading] = React.useState(false)

	React.useEffect(() => {
		if (open) {
			setTempKey(savedApiKey)
			setTempQuickModel(savedQuickModel)
			setTempDetailedModel(savedDetailedModel)
		}
	}, [open, savedApiKey, savedQuickModel, savedDetailedModel])

	async function loadModels(key: string) {
		if (!key) return
		setModelsLoading(true)
		try {
			const result = await api.ai.getModels(key)
			setModels(result.models)
		} catch {
			// silently fail — user can retry
		} finally {
			setModelsLoading(false)
		}
	}

	async function handleVerify() {
		await onVerify(tempKey)
		await loadModels(tempKey)
	}

	function handleSave() {
		onSave(tempKey, tempQuickModel, tempDetailedModel)
		onOpenChange(false)
	}

	const modelOptions = models.map((m) => ({
		value: m.id,
		label: m.name,
		pricing: m.pricing,
		provider: m.specification.provider,
	}))

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="left" className="flex flex-col gap-0 p-0">
				<SheetHeader className="px-4 pt-4 pb-2">
					<SheetTitle>Settings</SheetTitle>
					<SheetDescription>Configure PatrickOS.</SheetDescription>
				</SheetHeader>
				<Tabs
					defaultValue="ai-gateway"
					className="flex flex-1 flex-col overflow-hidden"
				>
					<TabsList className="mx-4 mb-2 grid w-auto grid-cols-4">
						<TabsTrigger value="general">General</TabsTrigger>
						<TabsTrigger value="ai-gateway">AI Gateway</TabsTrigger>
						<TabsTrigger value="local" disabled>
							Local
						</TabsTrigger>
						<TabsTrigger value="custom" disabled>
							Custom
						</TabsTrigger>
					</TabsList>

					{/* ── General tab ──────────────────────────────────────────── */}
					<TabsContent value="general" className="flex-1 overflow-y-auto">
						<div className="flex flex-col gap-5 px-4 pb-4">
							<div className="flex flex-col gap-2">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
									Appearance
								</p>
								<Select
									value={theme}
									onValueChange={(v) =>
										setTheme(v as "light" | "dark" | "system")
									}
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
						</div>
					</TabsContent>

					{/* ── AI Gateway tab ────────────────────────────────────────── */}
					<TabsContent value="ai-gateway" className="flex-1 overflow-y-auto">
						<div className="flex flex-col gap-5 px-4 pb-4">
							<div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
								<p className="font-medium text-foreground mb-1">
									Vercel AI Gateway
								</p>
								<p>
									Single API key to access OpenAI, Anthropic, Google, and more.{" "}
									<a
										href="https://vercel.com/docs/ai-gateway"
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary underline underline-offset-2"
									>
										Get a key →
									</a>
								</p>
							</div>

							<div className="flex flex-col gap-1.5">
								<p className="text-xs font-medium">API Key</p>
								<div className="flex gap-1.5">
									<div className="relative flex-1">
										<Input
											type={showKey ? "text" : "password"}
											value={tempKey}
											onChange={(e) => setTempKey(e.target.value)}
											placeholder="aig_..."
											className="pr-8"
										/>
										<Button
											variant="ghost"
											size="icon-xs"
											type="button"
											className="absolute right-1 top-1/2 -translate-y-1/2"
											onClick={() => setShowKey((v) => !v)}
										>
											{showKey ? <EyeOff size={12} /> : <Eye size={12} />}
										</Button>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={handleVerify}
										disabled={!tempKey || keyStatus === "verifying"}
									>
										{keyStatus === "verifying" ? (
											<Loader2 size={12} className="animate-spin" />
										) : (
											"Verify"
										)}
									</Button>
									{tempKey && (
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												setTempKey("")
												setModels([])
												onClear()
											}}
											className="text-destructive hover:text-destructive"
										>
											Clear
										</Button>
									)}

								</div>
								{keyStatus !== "idle" && (
									<p
										className={cn(
											"text-xs",
											keyStatus === "valid" && "text-green-600",
											keyStatus === "invalid" && "text-destructive",
											keyStatus === "verifying" && "text-muted-foreground",
										)}
									>
										{keyStatus === "valid" && "✓ Connected"}
										{keyStatus === "invalid" &&
											"Invalid key — check and try again"}
										{keyStatus === "verifying" && "Verifying…"}
									</p>
								)}
								<p className="text-xs text-muted-foreground">
									Stored in your browser only. Never sent to our servers.
								</p>
							</div>

							<Separator />

							<div className="flex flex-col gap-4">
								<div className="flex items-center justify-between">
									<p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
										Models
									</p>
									<Button
										variant="ghost"
										size="xs"
										onClick={() => loadModels(tempKey)}
										disabled={!tempKey || modelsLoading}
									>
										{modelsLoading ? (
											<Loader2 size={11} className="animate-spin" />
										) : (
											"Refresh"
										)}
									</Button>
								</div>

								{models.length === 0 && !modelsLoading && (
									<p className="text-xs text-muted-foreground">
										Verify your key to load available models.
									</p>
								)}

								{models.length > 0 && (
									<>
										<div className="flex flex-col gap-1.5">
											<p className="text-xs font-medium">Quick Model</p>
											<p className="text-xs text-muted-foreground">
												Used by AskPat and ExtractPat — fast and cheap.
											</p>
											<Select value={tempQuickModel} onValueChange={setTempQuickModel}>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{modelOptions.map((m) => (
														<SelectItem key={m.value} value={m.value}>
															{m.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{(() => {
												const m = modelOptions.find((m) => m.value === tempQuickModel)
												return m?.pricing ? (
													<p className="text-xs text-muted-foreground tabular-nums">
														${(parseFloat(m.pricing.input) * 1_000_000).toFixed(2)} in · ${(parseFloat(m.pricing.output) * 1_000_000).toFixed(2)} out per M tokens
													</p>
												) : null
											})()}
										</div>
										<div className="flex flex-col gap-1.5">
											<p className="text-xs font-medium">Detailed Model</p>
											<p className="text-xs text-muted-foreground">
												Used by AgentPat — thorough, best reasoning.
											</p>
											<Select value={tempDetailedModel} onValueChange={setTempDetailedModel}>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{modelOptions.map((m) => (
														<SelectItem key={m.value} value={m.value}>
															{m.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{(() => {
												const m = modelOptions.find((m) => m.value === tempDetailedModel)
												return m?.pricing ? (
													<p className="text-xs text-muted-foreground tabular-nums">
														${(parseFloat(m.pricing.input) * 1_000_000).toFixed(2)} in · ${(parseFloat(m.pricing.output) * 1_000_000).toFixed(2)} out per M tokens
													</p>
												) : null
											})()}
										</div>
									</>
								)}
							</div>

							<Button onClick={handleSave}>Save</Button>
						</div>
					</TabsContent>

					{/* ── Local tab (placeholder) ───────────────────────────────── */}
					<TabsContent
						value="local"
						className="flex-1 overflow-y-auto px-4 pb-4"
					>
						<p className="text-sm text-muted-foreground">
							Local model support via Ollama — coming soon.
						</p>
					</TabsContent>

					{/* ── Custom tab (placeholder) ──────────────────────────────── */}
					<TabsContent
						value="custom"
						className="flex-1 overflow-y-auto px-4 pb-4"
					>
						<p className="text-sm text-muted-foreground">
							Custom API endpoint — coming soon.
						</p>
					</TabsContent>
				</Tabs>
			</SheetContent>
		</Sheet>
	)
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function AppSidebar({
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
	onAuthOpen,
	onSettingsOpen,
	keyStatus,
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
	onAuthOpen: () => void
	onSettingsOpen: () => void
	keyStatus: KeyStatus
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
						className="text-muted-foreground shrink-0"
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
								className={cn(
									"shrink-0 group-data-[collapsible=icon]:hidden",
									keyStatus === "valid" && "text-green-600",
									keyStatus === "invalid" && "text-destructive",
								)}
								title={
									keyStatus === "valid"
										? "AI connected"
										: keyStatus === "verifying"
											? "Verifying…"
											: keyStatus === "invalid"
												? "Invalid API key — click to fix"
												: "Settings"
								}
							>
								{keyStatus === "verifying" ? (
									<Loader2 size={14} className="animate-spin" />
								) : (
									<Settings size={14} />
								)}
							</Button>
						</div>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}

// ─── Asset pane ────────────────────────────────────────────────────────────────

function ArtifactEditor({
	asset,
	onAssetUpdate,
}: {
	asset: ApiAsset
	onAssetUpdate: (updated: ApiAsset) => void
}) {
	const saveTimer = React.useRef<ReturnType<typeof setTimeout>>(null)
	const latestValue = React.useRef<Value | null>(null)
	const isDirty = React.useRef(false)

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

	// Flush on unmount (tab switch, close) — intentionally no deps, save is stable for asset lifetime
	// biome-ignore lint/correctness/useExhaustiveDependencies: unmount-only flush, save recreated each render
	React.useEffect(() => {
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
	const [file, setFile] = React.useState<File | null>(null)
	const [saving, setSaving] = React.useState(false)

	const stateKey =
		state.mode === "edit"
			? state.assetId
			: state.mode === "create"
				? `create-${state.kind}`
				: null

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only sync on open/switch
	React.useEffect(() => {
		if (state.mode === "closed") return
		if (state.mode === "create") {
			setTitle("")
			setType(defaultType)
			setDate("")
			setNotes("")
			setFile(null)
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
				let created: ApiAsset
				if (kind === "source") {
					const formData = new FormData()
					if (file) formData.append("file", file)
					formData.append("projectId", projectId)
					formData.append(
						"title",
						title.trim() || file?.name.replace(/\.pdf$/i, "") || "Untitled",
					)
					formData.append("type", type)
					formData.append("date", date)
					formData.append("notes", notes)
					created = await api.assets.createSource(formData)
				} else {
					created = await api.assets.create({
						projectId,
						title: title.trim() || "Untitled",
						kind,
						type,
						date,
						notes,
					})
				}
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
		<Sheet
			open={state.mode !== "closed"}
			onOpenChange={(v) => {
				if (!v) onClose()
			}}
		>
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
						{state.mode === "create" && kind === "source" && (
							<Field>
								<FieldLabel className="text-xs font-medium text-muted-foreground">
									PDF File
								</FieldLabel>
								<Input
									type="file"
									accept=".pdf,application/pdf"
									onChange={(e) => {
										const f = e.target.files?.[0] ?? null
										setFile(f)
										if (f && !title) setTitle(f.name.replace(/\.pdf$/i, ""))
									}}
								/>
							</Field>
						)}
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
			<div className="relative flex h-10 shrink-0 items-end bg-muted">
				{/* border line — tabs with z-10 render on top of it */}
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />
				<div className="relative z-10 flex shrink-0 items-center self-stretch px-2">
					<SidebarTrigger className="h-6 w-6" />
				</div>
				<div className="flex flex-1 items-end gap-0.5 overflow-x-auto px-1 tab-scroll">
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
								<AssetPane
									key={asset.id}
									asset={asset}
									onAssetUpdate={onAssetUpdate}
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
							onAssetUpdate={onAssetUpdate}
						/>
					)}
				</div>
			)}
		</div>
	)
}

// ─── AgentPat pane ────────────────────────────────────────────────────────────

function AgentPatPane({ onSend }: { onSend: (message: string) => void }) {
	const [input, setInput] = React.useState("")

	function send(message: string) {
		const trimmed = message.trim()
		if (!trimmed) return
		onSend(trimmed)
		setInput("")
	}

	return (
		<div className="flex h-full flex-col overflow-hidden bg-sidebar">
			<ScrollArea className="flex-1">
				<div className="mx-auto max-w-sm px-6 py-10 text-center">
					<div className="mb-4 flex justify-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
							<Clover className="size-8 text-primary" />
						</div>
					</div>
					<h2 className="mb-1 font-heading text-lg font-semibold">AgentPat</h2>
					<p className="text-sm text-muted-foreground">
						Your AI patent attorney assistant. To get started send a message or
						pick a suggestion.
					</p>
				</div>
			</ScrollArea>
			<div className="shrink-0 flex gap-2 overflow-x-auto px-3 tab-scroll">
				{AGENTPAT_SUGGESTIONS.map((s) => (
					<Button
						key={s}
						variant="secondary"
						size="sm"
						className="h-auto rounded-full px-3 py-1.5 text-xs font-normal"
						onClick={() => send(s)}
					>
						{s}
					</Button>
				))}
			</div>
			<div className="shrink-0 p-3">
				<div className="rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
					<Textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								send(input)
							}
						}}
						placeholder="Ask AgentPat anything…"
						className="min-h-[64px] resize-none rounded-none border-0 bg-transparent dark:bg-transparent p-3 text-sm shadow-none focus-visible:ring-0"
					/>
					<div className="flex justify-end px-3 pb-2">
						<Button size="sm" onClick={() => send(input)}>
							Send <Send />
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

// ─── Chat pane ────────────────────────────────────────────────────────────────

function ChatPane({
	chat,
	openAssets,
	onRemoveAsset,
	onSend,
}: {
	chat: Chat
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	onSend: (chatId: string, message: string) => void
}) {
	const [input, setInput] = React.useState("")

	function send() {
		const trimmed = input.trim()
		if (!trimmed) return
		onSend(chat.id, trimmed)
		setInput("")
	}

	return (
		<div className="flex h-full flex-col overflow-hidden bg-sidebar">
			<ScrollArea className="flex-1 px-3 py-3">
				<div className="space-y-4">
					{chat.messages.length === 0 ? (
						<p className="py-12 text-center text-sm text-muted-foreground">
							No messages yet. Start the conversation below.
						</p>
					) : (
						chat.messages.map((msg) => (
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
						))
					)}
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
						className="min-h-[64px] resize-none rounded-none border-0 bg-transparent dark:bg-transparent p-3 text-sm shadow-none focus-visible:ring-0"
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

// ─── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({
	chats,
	openChatIds,
	activeChatId,
	openAssets,
	onNewChat,
	onCloseChat,
	onSetActiveChat,
	onSendToChat,
	onSendInAgentPat,
	onRemoveAsset,
}: {
	chats: Chat[]
	openChatIds: string[]
	activeChatId: string
	openAssets: ApiAsset[]
	onNewChat: () => void
	onCloseChat: (id: string) => void
	onSetActiveChat: (id: string) => void
	onSendToChat: (chatId: string, message: string) => void
	onSendInAgentPat: (message: string) => void
	onRemoveAsset: (id: string) => void
}) {
	const openChats = openChatIds
		.map((id) => chats.find((c) => c.id === id))
		.filter(Boolean) as Chat[]
	const activeChat = openChats.find((c) => c.id === activeChatId)

	return (
		<div className="flex h-full flex-col overflow-hidden border-l">
			{/* Tab bar */}
			<div className="relative flex h-10 shrink-0 items-end bg-muted px-1 gap-0.5">
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />

				{/* AgentPat — fixed left, shrinks to icon when other tabs are open */}
				<div
					className={cn(
						"relative z-10 flex shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
						activeChatId === "agentpat"
							? "border-border bg-sidebar text-foreground"
							: "border-transparent text-muted-foreground hover:text-foreground",
					)}
				>
					<Button
						variant="ghost"
						size="xs"
						onClick={() => onSetActiveChat("agentpat")}
						className="gap-1.5"
					>
						<Clover className="size-4 shrink-0 text-primary" />
						{openChatIds.length === 0 && <span>AgentPat</span>}
					</Button>
				</div>

				{/* Open chat tabs */}
				<div className="flex flex-1 items-end gap-0.5 overflow-x-auto tab-scroll">
					{openChats.map((chat) => (
						<div
							key={chat.id}
							className={cn(
								"relative group flex shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
								activeChatId === chat.id
									? "z-10 border-border bg-sidebar text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							<Button
								variant="ghost"
								size="xs"
								onClick={() => onSetActiveChat(chat.id)}
								className="gap-1.5 rounded-none rounded-tl-md pr-0.5"
							>
								<MessageSquare size={12} className="shrink-0" />
								<span className="max-w-[120px] truncate">{chat.title}</span>
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={() => onCloseChat(chat.id)}
								className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
							>
								<X size={10} />
							</Button>
						</div>
					))}
				</div>

				{/* Plus — new chat, styled as a tab */}
				<div className="relative z-10 flex shrink-0 items-center rounded-t-md border border-b-0 border-transparent text-muted-foreground transition-colors hover:text-foreground">
					<Button
						variant="ghost"
						size="xs"
						onClick={onNewChat}
						title="New chat"
					>
						<Plus size={12} />
					</Button>
				</div>
			</div>

			{/* Content */}
			{activeChatId === "agentpat" || !activeChat ? (
				<AgentPatPane onSend={onSendInAgentPat} />
			) : (
				<ChatPane
					chat={activeChat}
					openAssets={openAssets}
					onRemoveAsset={onRemoveAsset}
					onSend={onSendToChat}
				/>
			)}
		</div>
	)
}

// ─── Chat meta sheet ──────────────────────────────────────────────────────────

type ChatSheetState = { mode: "closed" } | { mode: "edit"; chatId: string }

function ChatMetaSheet({
	state,
	chat,
	onClose,
	onUpdated,
	onDeleted,
}: {
	state: ChatSheetState
	chat: Chat | undefined
	onClose: () => void
	onUpdated: (id: string, title: string) => void
	onDeleted: (id: string) => void
}) {
	const [title, setTitle] = React.useState("")
	const [saving, setSaving] = React.useState(false)

	const chatId = state.mode === "edit" ? state.chatId : null

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only sync on open/switch
	React.useEffect(() => {
		if (state.mode === "edit" && chat) setTitle(chat.title)
	}, [chatId])

	function handleSave() {
		if (state.mode !== "edit" || !chat) return
		setSaving(true)
		onUpdated(chat.id, title.trim() || "New Chat")
		setSaving(false)
		onClose()
	}

	return (
		<Sheet
			open={state.mode !== "closed"}
			onOpenChange={(v) => {
				if (!v) onClose()
			}}
		>
			<SheetContent side="left">
				<SheetHeader>
					<SheetTitle>{chat?.title ?? ""}</SheetTitle>
					<SheetDescription>Rename or delete this chat.</SheetDescription>
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
								placeholder="New Chat"
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSave()
								}}
							/>
						</Field>
					</FieldGroup>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
					{state.mode === "edit" && chat && (
						<>
							<Separator />
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="destructive" size="sm" className="gap-1.5">
										<Trash2 size={14} />
										Delete chat
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>Delete chat?</AlertDialogTitle>
										<AlertDialogDescription>
											"{chat.title}" will be permanently removed.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={() => {
												onDeleted(chat.id)
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

// ─── Root ─────────────────────────────────────────────────────────────────────

function WorkspacePage() {
	// Assets
	const [assets, setAssets] = React.useState<ApiAsset[]>([])
	const [openTabIds, setOpenTabIds] = React.useState<string[]>([])
	const [activeTab, setActiveTab] = React.useState("")
	const [splitView, setSplitView] = React.useState(false)
	const [assetSheet, setAssetSheet] = React.useState<AssetSheetState>({
		mode: "closed",
	})

	// Chats
	const [chats, setChats] = React.useState<Chat[]>(MOCK_CHATS)
	const [openChatIds, setOpenChatIds] = React.useState<string[]>([])
	const [activeChatId, setActiveChatId] = React.useState("agentpat")
	const [chatSheet, setChatSheet] = React.useState<ChatSheetState>({
		mode: "closed",
	})

	// AI settings
	const [apiKey, setApiKey] = React.useState(
		() => localStorage.getItem("ai-gateway-key") ?? "",
	)
	const [keyStatus, setKeyStatus] = React.useState<KeyStatus>("idle")
	const [quickModel, setQuickModel] = React.useState(
		() => localStorage.getItem("ai-gateway-quick-model") ?? DEFAULT_QUICK_MODEL,
	)
	const [detailedModel, setDetailedModel] = React.useState(
		() =>
			localStorage.getItem("ai-gateway-detailed-model") ??
			DEFAULT_DETAILED_MODEL,
	)

	// Projects / UI
	const [chatCollapsed, setChatCollapsed] = React.useState(false)
	const [projects, setProjects] = React.useState<Project[]>([])
	const [projectsLoading, setProjectsLoading] = React.useState(true)
	const [currentProjectId, setCurrentProjectId] = React.useState("")
	const [projectsOpen, setProjectsOpen] = React.useState(false)
	const [authOpen, setAuthOpen] = React.useState(false)
	const [settingsOpen, setSettingsOpen] = React.useState(false)

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

	// ── AI settings handlers ──────────────────────────────────────────────────

	async function verifyKey(key: string) {
		if (!key) {
			setKeyStatus("idle")
			return
		}
		setKeyStatus("verifying")
		try {
			const result = await api.ai.verifyKey(key)
			setKeyStatus(result.valid ? "valid" : "invalid")
		} catch {
			setKeyStatus("invalid")
		}
	}

	function clearApiKey() {
		localStorage.removeItem("ai-gateway-key")
		setApiKey("")
		setKeyStatus("idle")
	}

	function saveAiSettings(key: string, quick: string, detailed: string) {
		localStorage.setItem("ai-gateway-key", key)
		localStorage.setItem("ai-gateway-quick-model", quick)
		localStorage.setItem("ai-gateway-detailed-model", detailed)
		setApiKey(key)
		setQuickModel(quick)
		setDetailedModel(detailed)
	}

	// ── Asset handlers ────────────────────────────────────────────────────────

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

	// ── Project handlers ──────────────────────────────────────────────────────

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

	// ── Chat handlers ─────────────────────────────────────────────────────────

	function openChat(id: string) {
		setOpenChatIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
		setActiveChatId(id)
	}

	function closeChat(id: string) {
		setOpenChatIds((prev) => {
			const next = prev.filter((c) => c !== id)
			if (activeChatId === id) setActiveChatId(next.at(-1) ?? "agentpat")
			return next
		})
	}

	function newChat() {
		const chat: Chat = {
			id: crypto.randomUUID(),
			title: "New Chat",
			messages: [],
			createdAt: new Date(),
		}
		setChats((prev) => [chat, ...prev])
		openChat(chat.id)
	}

	function deleteChat(id: string) {
		setChats((prev) => prev.filter((c) => c.id !== id))
		closeChat(id)
	}

	function updateChat(id: string, title: string) {
		setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
	}

	function sendInAgentPat(message: string) {
		const chat: Chat = {
			id: crypto.randomUUID(),
			title: message.length > 50 ? `${message.slice(0, 50)}…` : message,
			messages: [
				{ id: crypto.randomUUID(), role: "user", content: message },
				{
					id: crypto.randomUUID(),
					role: "assistant",
					content: "On it. I'll start working through this now.",
				},
			],
			createdAt: new Date(),
		}
		setChats((prev) => [chat, ...prev])
		openChat(chat.id)
	}

	function sendToChat(chatId: string, message: string) {
		const userMsg: Message = {
			id: crypto.randomUUID(),
			role: "user",
			content: message,
		}
		const assistantMsg: Message = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: "Got it. Working on a response now.",
		}
		setChats((prev) =>
			prev.map((c) =>
				c.id === chatId
					? { ...c, messages: [...c.messages, userMsg, assistantMsg] }
					: c,
			),
		)
	}

	// ── Panel collapse ────────────────────────────────────────────────────────

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
			<SidebarProvider className="h-full">
				<AppSidebar
					assets={assets}
					openTabIds={openTabIds}
					chats={chats}
					openChatIds={openChatIds}
					projects={projects}
					projectsLoading={projectsLoading}
					currentProjectId={currentProjectId}
					onOpen={openAsset}
					onEdit={(id) => setAssetSheet({ mode: "edit", assetId: id })}
					onAddArtifact={addArtifact}
					onAddSource={addSource}
					onOpenChat={openChat}
					onNewChat={newChat}
					onEditChat={(id) => setChatSheet({ mode: "edit", chatId: id })}
					onManageProjects={() => setProjectsOpen(true)}
					onAuthOpen={() => setAuthOpen(true)}
					onSettingsOpen={() => setSettingsOpen(true)}
					keyStatus={keyStatus}
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
								onAssetUpdate={(updated) =>
									setAssets((prev) =>
										prev.map((a) => (a.id === updated.id ? updated : a)),
									)
								}
								chatCollapsed={chatCollapsed}
							/>
						</ResizablePanel>
						<ResizableHandle
							withHandle
							className="w-[3px] before:absolute before:inset-x-0 before:top-0 before:h-10 before:bg-muted before:content-['']"
						/>
						<ResizablePanel
							panelRef={chatPanelRef}
							defaultSize="32%"
							minSize="20%"
							maxSize="50%"
							collapsible
							collapsedSize="0%"
							style={{ transition: "flex 150ms ease" }}
						>
							<ChatPanel
								chats={chats}
								openChatIds={openChatIds}
								activeChatId={activeChatId}
								openAssets={openAssets}
								onNewChat={newChat}
								onCloseChat={closeChat}
								onSetActiveChat={setActiveChatId}
								onSendToChat={sendToChat}
								onSendInAgentPat={sendInAgentPat}
								onRemoveAsset={closeTab}
							/>
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
			<SettingsSheet
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				savedApiKey={apiKey}
				keyStatus={keyStatus}
				savedQuickModel={quickModel}
				savedDetailedModel={detailedModel}
				onVerify={verifyKey}
				onSave={saveAiSettings}
				onClear={clearApiKey}
			/>
			<AssetMetaSheet
				state={assetSheet}
				asset={
					assetSheet.mode === "edit"
						? assets.find((a) => a.id === assetSheet.assetId)
						: undefined
				}
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
			<ChatMetaSheet
				state={chatSheet}
				chat={
					chatSheet.mode === "edit"
						? chats.find((c) => c.id === chatSheet.chatId)
						: undefined
				}
				onClose={() => setChatSheet({ mode: "closed" })}
				onUpdated={updateChat}
				onDeleted={deleteChat}
			/>
		</>
	)
}
