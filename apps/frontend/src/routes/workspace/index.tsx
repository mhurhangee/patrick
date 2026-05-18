import { createFileRoute } from "@tanstack/react-router"
import type { ArtifactKind, ArtifactType } from "@patrickos/db"
import { api, type ApiArtifact } from "@/lib/api"
import {
	CalendarDays,
	Check,
	ChevronDown,
	ChevronsUpDown,
	CloudUpload,
	Columns3,
	File,
	FilePen,
	FilePlus,
	Layers,
	PanelRight,
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

const ARTIFACT_TYPES: { id: ArtifactType; label: string }[] = [
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

function groupArtifactsByType(artifacts: ApiArtifact[]) {
	const groups: { type: ArtifactType; label: string; artifacts: ApiArtifact[] }[] = []
	for (const { id, label } of ARTIFACT_TYPES) {
		const typeArtifacts = artifacts
			.filter((a) => a.type === id)
			.sort((a, b) => a.date.localeCompare(b.date))
		if (typeArtifacts.length > 0) groups.push({ type: id, label, artifacts: typeArtifacts })
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

// ─── Artifact kind icon ────────────────────────────────────────────────────────

function ArtifactKindIcon({ kind, size = 13 }: { kind: ArtifactKind; size?: number }) {
	if (kind === "pdf")
		return <File size={size} className="shrink-0 text-red-500" />
	if (kind === "generated")
		return <Layers size={size} className="shrink-0 text-emerald-500" />
	return <FilePen size={size} className="shrink-0 text-amber-500" />
}

// ─── Project selector ─────────────────────────────────────────────────────────

function ProjectSelector({
	projects,
	currentId,
	loading,
	onChange,
	onCreate,
}: {
	projects: Project[]
	currentId: string
	loading: boolean
	onChange: (id: string) => void
	onCreate: () => void
}) {
	const current = projects.find((p) => p.id === currentId) ?? projects[0]

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium hover:bg-muted group-data-[collapsible=icon]:hidden"
				>
					<span className="flex-1 truncate text-left text-muted-foreground">
						{loading ? "Loading…" : (current?.name ?? "No projects")}
					</span>
					<ChevronsUpDown
						size={11}
						className="shrink-0 text-muted-foreground"
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-60">
				{projects.map((p) => (
					<DropdownMenuItem
						key={p.id}
						onClick={() => onChange(p.id)}
						className="text-xs"
					>
						<span className="flex-1 truncate">{p.name}</span>
						{p.id === currentId && (
							<Check size={12} className="ml-2 shrink-0" />
						)}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onCreate} className="text-xs">
					<Plus size={12} />
					New project
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
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
			<SheetContent>
				<SheetHeader>
					<SheetTitle>Account</SheetTitle>
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
			<SheetContent>
				<SheetHeader>
					<SheetTitle>Settings</SheetTitle>
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
	artifacts,
	openTabIds,
	projects,
	projectsLoading,
	currentProjectId,
	onOpen,
	onAddDraft,
	onUpload,
	onProjectChange,
	onProjectCreate,
	onAuthOpen,
	onSettingsOpen,
}: {
	artifacts: ApiArtifact[]
	openTabIds: string[]
	projects: Project[]
	projectsLoading: boolean
	currentProjectId: string
	onOpen: (id: string) => void
	onAddDraft: () => void
	onUpload: () => void
	onProjectChange: (id: string) => void
	onProjectCreate: () => void
	onAuthOpen: () => void
	onSettingsOpen: () => void
}) {
	const openSet = new Set(openTabIds)
	const groups = groupArtifactsByType(artifacts)

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="h-9 px-3">
				<div className="flex items-center gap-2">
					<div className="shrink-0">
						<Logo size={20} />
					</div>
					<ProjectSelector
						projects={projects}
						currentId={currentProjectId}
						loading={projectsLoading}
						onChange={onProjectChange}
						onCreate={onProjectCreate}
					/>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{groups.map((group) => (
					<SidebarGroup key={group.type}>
						<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
						<SidebarMenu>
							{group.artifacts.map((artifact) => (
								<SidebarMenuItem key={artifact.id}>
									<SidebarMenuButton
										onClick={() => onOpen(artifact.id)}
										isActive={openSet.has(artifact.id)}
										className="gap-2 text-xs"
										tooltip={artifact.title}
									>
										<ArtifactKindIcon kind={artifact.kind} />
										<span className="truncate">{artifact.title}</span>
										<span className="ml-auto shrink-0 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
											{formatShortDate(artifact.date)}
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
							onClick={onAddDraft}
							className="gap-2 text-xs text-muted-foreground"
							tooltip="New draft"
						>
							<FilePlus size={14} />
							<span>New draft</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton
							onClick={onUpload}
							className="gap-2 text-xs text-muted-foreground"
							tooltip="Upload file"
						>
							<CloudUpload size={14} />
							<span>Upload file</span>
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
							<button
								type="button"
								onClick={onSettingsOpen}
								className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground group-data-[collapsible=icon]:hidden"
							>
								<Settings size={14} />
							</button>
						</div>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}

// ─── Artifact pane ─────────────────────────────────────────────────────────────

const LABEL_CLASS =
	"text-[10px] uppercase tracking-widest text-muted-foreground font-normal"

function ArtifactPane({
	artifact,
	isNew,
	onUpdate,
	onDelete,
}: {
	artifact: ApiArtifact
	isNew: boolean
	onUpdate: (id: string, changes: Parameters<typeof api.artifacts.update>[1]) => void
	onDelete: (id: string) => void
}) {
	const [open, setOpen] = React.useState(isNew)
	const [title, setTitle] = React.useState(artifact.title)
	const [type, setType] = React.useState<ArtifactType>(artifact.type)
	const [date, setDate] = React.useState(artifact.date)
	const [notes, setNotes] = React.useState(artifact.notes)

	const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined

	return (
		<ScrollArea className="h-full w-full">
			<div className="mx-auto max-w-2xl px-8 py-6">
				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleTrigger asChild>
						<button
							type="button"
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
						>
							<ArtifactKindIcon kind={artifact.kind} size={13} />
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
						</button>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="mt-2 rounded-md border bg-muted/30 p-4">
							<FieldGroup className="gap-3">
								<Field>
									<FieldLabel className={LABEL_CLASS}>Title</FieldLabel>
									<Input
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										onBlur={() => onUpdate(artifact.id, { title })}
										className="h-7 text-xs"
									/>
								</Field>
								<Field>
									<FieldLabel className={LABEL_CLASS}>Type</FieldLabel>
									<Select
										value={type}
										onValueChange={(v) => {
											const t = v as ArtifactType
											setType(t)
											onUpdate(artifact.id, { type: t })
										}}
									>
										<SelectTrigger
											size="sm"
											className="h-7 w-full rounded-md text-xs"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{ARTIFACT_TYPES.map((at) => (
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
													onUpdate(artifact.id, { date: iso })
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
										onBlur={() => onUpdate(artifact.id, { notes })}
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
										Delete document
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>Delete document?</AlertDialogTitle>
										<AlertDialogDescription>
											"{title}" will be permanently removed.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={() => onDelete(artifact.id)}
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
	artifacts,
	openTabIds,
	activeTab,
	newArtifactId,
	splitView,
	onTabClick,
	onTabClose,
	onSplitToggle,
	onChatToggle,
	onUpdateArtifact,
	onDeleteArtifact,
}: {
	artifacts: ApiArtifact[]
	openTabIds: string[]
	activeTab: string
	newArtifactId: string | null
	splitView: boolean
	onTabClick: (id: string) => void
	onTabClose: (id: string) => void
	onSplitToggle: () => void
	onChatToggle: () => void
	onUpdateArtifact: (id: string, changes: Parameters<typeof api.artifacts.update>[1]) => void
	onDeleteArtifact: (id: string) => void
}) {
	const openArtifacts = openTabIds
		.map((id) => artifacts.find((a) => a.id === id))
		.filter(Boolean) as ApiArtifact[]
	const activeArtifact = openArtifacts.find((a) => a.id === activeTab) ?? openArtifacts[0]

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="relative flex h-9 shrink-0 items-end bg-muted/30">
				<div className="absolute inset-x-0 bottom-0 h-px bg-border" />
				<div className="relative z-10 flex shrink-0 items-center self-stretch px-2">
					<SidebarTrigger className="h-6 w-6" />
				</div>
				<div className="flex flex-1 items-end gap-0.5 overflow-x-auto px-1">
					{openArtifacts.map((artifact) => (
						<div
							key={artifact.id}
							className={cn(
								"group flex shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
								!splitView && activeTab === artifact.id
									? "z-10 border-border bg-background text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							<Button
								variant="ghost"
								size="xs"
								onClick={() => onTabClick(artifact.id)}
								className="gap-1.5 rounded-none rounded-tl-md pr-0.5"
							>
								<ArtifactKindIcon kind={artifact.kind} />
								<span className="max-w-[120px] truncate">{artifact.title}</span>
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={() => onTabClose(artifact.id)}
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
							disabled={openArtifacts.length < 2}
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

			{openArtifacts.length === 0 ? (
				<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
					Open a document from the sidebar
				</div>
			) : splitView && openArtifacts.length > 1 ? (
				<ResizablePanelGroup orientation="horizontal" className="flex-1">
					{openArtifacts.map((artifact, i) => (
						<React.Fragment key={artifact.id}>
							{i > 0 && <ResizableHandle withHandle />}
							<ResizablePanel
								defaultSize={`${100 / openArtifacts.length}%`}
								collapsible
								collapsedSize="0%"
								minSize="10%"
							>
								<ArtifactPane
									key={artifact.id}
									artifact={artifact}
									isNew={artifact.id === newArtifactId}
									onUpdate={onUpdateArtifact}
									onDelete={onDeleteArtifact}
								/>
							</ResizablePanel>
						</React.Fragment>
					))}
				</ResizablePanelGroup>
			) : (
				<div className="flex-1 overflow-hidden">
					{activeArtifact && (
						<ArtifactPane
							key={activeArtifact.id}
							artifact={activeArtifact}
							isNew={activeArtifact.id === newArtifactId}
							onUpdate={onUpdateArtifact}
							onDelete={onDeleteArtifact}
						/>
					)}
				</div>
			)}
		</div>
	)
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

function Chat({
	openArtifacts,
	onRemoveArtifact,
}: {
	openArtifacts: ApiArtifact[]
	onRemoveArtifact: (id: string) => void
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
				{openArtifacts.length > 0 && (
					<div className="flex flex-wrap items-center gap-1">
						<span className="shrink-0 text-[10px] text-muted-foreground">
							In context:
						</span>
						{openArtifacts.map((artifact) => (
							<span
								key={artifact.id}
								className="flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
							>
								{artifact.title}
								<button
									type="button"
									onClick={() => onRemoveArtifact(artifact.id)}
									className="hover:text-foreground"
								>
									<X size={9} />
								</button>
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
						placeholder="Ask about open documents…"
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
	const [artifacts, setArtifacts] = React.useState<ApiArtifact[]>([])
	const [openTabIds, setOpenTabIds] = React.useState<string[]>([])
	const [activeTab, setActiveTab] = React.useState("")
	const [newArtifactId, setNewArtifactId] = React.useState<string | null>(null)
	const [splitView, setSplitView] = React.useState(false)
	const [chatCollapsed, setChatCollapsed] = React.useState(false)
	const [projects, setProjects] = React.useState<Project[]>([])
	const [projectsLoading, setProjectsLoading] = React.useState(true)
	const [currentProjectId, setCurrentProjectId] = React.useState("")
	const [authOpen, setAuthOpen] = React.useState(false)
	const [settingsOpen, setSettingsOpen] = React.useState(false)
	const chatPanelRef = usePanelRef()

	// Load projects on mount
	React.useEffect(() => {
		api.projects.list().then((data) => {
			setProjects(data)
			if (data.length > 0) setCurrentProjectId(data[0].id)
		}).finally(() => setProjectsLoading(false))
	}, [])

	// Load artifacts when project changes
	React.useEffect(() => {
		if (!currentProjectId) return
		setArtifacts([])
		setOpenTabIds([])
		setActiveTab("")
		api.artifacts.list(currentProjectId).then(setArtifacts)
	}, [currentProjectId])

	function openArtifact(id: string) {
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

	async function updateArtifact(id: string, changes: Parameters<typeof api.artifacts.update>[1]) {
		const updated = await api.artifacts.update(id, changes)
		setArtifacts((prev) => prev.map((a) => (a.id === id ? updated : a)))
	}

	async function deleteArtifact(id: string) {
		await api.artifacts.delete(id)
		closeTab(id)
		setArtifacts((prev) => prev.filter((a) => a.id !== id))
	}

	async function addDraft() {
		if (!currentProjectId) return
		const artifact = await api.artifacts.create({
			projectId: currentProjectId,
			title: "New Draft",
			type: "claims-draft",
			kind: "draft",
		})
		setArtifacts((prev) => [...prev, artifact])
		setNewArtifactId(artifact.id)
		openArtifact(artifact.id)
	}

	async function addUpload() {
		if (!currentProjectId) return
		const artifact = await api.artifacts.create({
			projectId: currentProjectId,
			title: "Uploaded Document",
			type: "inventor-disclosure",
			kind: "pdf",
		})
		setArtifacts((prev) => [...prev, artifact])
		setNewArtifactId(artifact.id)
		openArtifact(artifact.id)
	}

	async function createProject() {
		const project = await api.projects.create("New Project")
		setProjects((prev) => [...prev, project])
		setCurrentProjectId(project.id)
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

	const openArtifacts = openTabIds
		.map((id) => artifacts.find((a) => a.id === id))
		.filter(Boolean) as ApiArtifact[]

	return (
		<>
			<SidebarProvider>
				<AppSidebar
					artifacts={artifacts}
					openTabIds={openTabIds}
					projects={projects}
					projectsLoading={projectsLoading}
					currentProjectId={currentProjectId}
					onOpen={openArtifact}
					onAddDraft={addDraft}
					onUpload={addUpload}
					onProjectChange={setCurrentProjectId}
					onProjectCreate={createProject}
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
								artifacts={artifacts}
								openTabIds={openTabIds}
								activeTab={activeTab}
								newArtifactId={newArtifactId}
								splitView={splitView}
								onTabClick={(id) => {
									setActiveTab(id)
									setSplitView(false)
								}}
								onTabClose={closeTab}
								onSplitToggle={() => setSplitView((v) => !v)}
								onChatToggle={toggleChat}
								onUpdateArtifact={updateArtifact}
								onDeleteArtifact={deleteArtifact}
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
							<Chat openArtifacts={openArtifacts} onRemoveArtifact={closeTab} />
						</ResizablePanel>
					</ResizablePanelGroup>
				</SidebarInset>
			</SidebarProvider>
			<AuthSheet open={authOpen} onOpenChange={setAuthOpen} />
			<SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
		</>
	)
}
