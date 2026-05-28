import { PROJECT_TYPE_CONFIG, type ApiProject, type ProjectType } from "@patrickos/db"
import { Check, FolderOpen, Loader2, Plus, Search, Trash2 } from "lucide-react"
import * as React from "react"
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@/components/ui/sidebar"

// ─── Project type config ──────────────────────────────────────────────────────

const PROJECT_TYPE_OPTIONS = Object.entries(PROJECT_TYPE_CONFIG).map(
	([id, cfg]) => ({ id: id as ProjectType, label: cfg.label }),
)

// ─── useSaveButton ────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved"

function useSaveButton() {
	const [status, setStatus] = React.useState<SaveStatus>("idle")
	const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	React.useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [])

	async function wrap(fn: () => void | Promise<void>) {
		setStatus("saving")
		try {
			await fn()
			setStatus("saved")
			timerRef.current = setTimeout(() => setStatus("idle"), 2000)
		} catch {
			setStatus("idle")
		}
	}

	return { status, wrap }
}

function SaveButton({
	status,
	isDirty,
	onClick,
}: {
	status: SaveStatus
	isDirty: boolean
	onClick: () => void
}) {
	return (
		<Button
			size="sm"
			variant="outline"
			onClick={onClick}
			disabled={!isDirty || status === "saving"}
		>
			{status === "saving" ? (
				<>
					<Loader2 size={12} className="animate-spin" />
					Saving…
				</>
			) : status === "saved" ? (
				<>
					<Check size={12} />
					Saved
				</>
			) : (
				"Save"
			)}
		</Button>
	)
}

// ─── New project panel ────────────────────────────────────────────────────────

function NewProjectPanel({
	onCreate,
	onCreated,
}: {
	onCreate: (name: string, type: ProjectType) => Promise<ApiProject>
	onCreated: (project: ApiProject) => void
}) {
	const [name, setName] = React.useState("")
	const [type, setType] = React.useState<ProjectType>("office-action-response")
	const [creating, setCreating] = React.useState(false)

	async function handleCreate() {
		const trimmed = name.trim()
		if (!trimmed) return
		setCreating(true)
		try {
			const project = await onCreate(trimmed, type)
			onCreated(project)
		} finally {
			setCreating(false)
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">New Project</h2>
				<p className="text-xs text-muted-foreground">
					Create a new patent matter.
				</p>
			</div>
			<Separator />
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="new-project-name">Name</Label>
					<Input
						id="new-project-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Smith Corp — Office Action 2024"
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreate()
						}}
						autoFocus
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="new-project-type">Type</Label>
					<Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
						<SelectTrigger id="new-project-type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PROJECT_TYPE_OPTIONS.map((opt) => (
								<SelectItem key={opt.id} value={opt.id}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						{PROJECT_TYPE_CONFIG[type].description}
					</p>
				</div>
			</div>
			<div className="flex justify-end">
				<Button
					size="sm"
					onClick={handleCreate}
					disabled={!name.trim() || creating}
				>
					{creating ? (
						<>
							<Loader2 size={12} className="animate-spin" />
							Creating…
						</>
					) : (
						"Create project"
					)}
				</Button>
			</div>
		</div>
	)
}

// ─── Edit project panel ───────────────────────────────────────────────────────

function EditProjectPanel({
	project,
	isCurrent,
	onUpdate,
	onDelete,
	onOpen,
}: {
	project: ApiProject
	isCurrent: boolean
	onUpdate: (
		id: string,
		patch: { name?: string; type?: ProjectType },
	) => Promise<ApiProject>
	onDelete: (id: string) => Promise<void>
	onOpen: () => void
}) {
	const [name, setName] = React.useState(project.name)
	const [type, setType] = React.useState<ProjectType>(project.type)
	const [savedName, setSavedName] = React.useState(project.name)
	const [savedType, setSavedType] = React.useState<ProjectType>(project.type)
	const { status, wrap } = useSaveButton()

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — sync on project identity change only
	React.useEffect(() => {
		setName(project.name)
		setType(project.type)
		setSavedName(project.name)
		setSavedType(project.type)
	}, [project.id])

	const isDirty = name !== savedName || type !== savedType

	async function handleSave() {
		const updated = await onUpdate(project.id, {
			name: name.trim() || project.name,
			type,
		})
		setSavedName(updated.name)
		setSavedType(updated.type)
	}

	const createdDate = new Date(project.createdAt).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	})

	const typeConfig = PROJECT_TYPE_CONFIG[project.type]

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<h2 className="text-base font-semibold">{project.name}</h2>
				</div>
				<div className="flex items-center gap-2">
					<p className="py-0.5 text-xs text-muted-foreground">{createdDate}</p>
					<p className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
						{typeConfig.label}
					</p>
				</div>
				{/* TODO: add number of sources/artifacts/chats */}
			</div>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="edit-project-name">Name</Label>
					<Input
						id="edit-project-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && isDirty) wrap(handleSave)
						}}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="edit-project-type">Type</Label>
					<Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
						<SelectTrigger id="edit-project-type">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PROJECT_TYPE_OPTIONS.map((opt) => (
								<SelectItem key={opt.id} value={opt.id}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						{PROJECT_TYPE_CONFIG[type].description}
					</p>
					{/* TODO: add project notes section for context about the project, which can be referenced in chats and office action responses */}
				</div>
			</div>

			<div className="flex items-center justify-between">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="w-fit gap-1.5 text-destructive hover:text-destructive"
						>
							<Trash2 size={13} />
							Delete project
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent size="sm">
						<AlertDialogHeader>
							<AlertDialogTitle>Delete project?</AlertDialogTitle>
							<AlertDialogDescription>
								"{project.name}" and all its sources and artifacts will be
								permanently deleted. This cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => onDelete(project.id)}
							>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				<div className="flex items-center gap-2">
					<SaveButton
						status={status}
						isDirty={isDirty}
						onClick={() => wrap(handleSave)}
					/>
					<Button
						size="sm"
						variant={isCurrent ? "secondary" : "default"}
						onClick={onOpen}
					>
						{isCurrent ? "Current project" : "Open project"}
					</Button>
				</div>
			</div>
		</div>
	)
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

type PanelState = "empty" | "new" | { id: string }

export function ProjectManagerDialog({
	open,
	onOpenChange,
	projects,
	currentProjectId,
	onSelect,
	onCreate,
	onUpdate,
	onDelete,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	projects: ApiProject[]
	currentProjectId: string
	onSelect: (id: string) => void
	onCreate: (name: string, type: ProjectType) => Promise<ApiProject>
	onUpdate: (
		id: string,
		patch: { name?: string; type?: ProjectType },
	) => Promise<ApiProject>
	onDelete: (id: string) => Promise<void>
}) {
	const [panelState, setPanelState] = React.useState<PanelState>("empty")
	const [search, setSearch] = React.useState("")

	// Select current project when dialog opens
	React.useEffect(() => {
		if (!open) return
		setSearch("")
		setPanelState(currentProjectId ? { id: currentProjectId } : "empty")
	}, [open, currentProjectId])

	const filtered = projects.filter((p) =>
		p.name.toLowerCase().includes(search.toLowerCase()),
	)

	const selectedProject =
		panelState !== "empty" && panelState !== "new"
			? projects.find((p) => p.id === panelState.id)
			: undefined

	function handleOpen(id: string) {
		onSelect(id)
		onOpenChange(false)
	}

	async function handleDelete(id: string) {
		await onDelete(id)
		setPanelState("empty")
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 h-[560px] md:max-w-[760px] lg:max-w-[900px] flex flex-col">
				<DialogTitle className="sr-only">Projects</DialogTitle>
				<DialogDescription className="sr-only">
					Manage your patent matters.
				</DialogDescription>

				<SidebarProvider
					className="flex-1 h-full min-h-0 items-stretch"
					style={{ "--sidebar-width": "13rem" } as React.CSSProperties}
				>
					{/* Left — project list */}
					<Sidebar
						collapsible="none"
						className="flex h-full border-r border-border bg-sidebar"
					>
						<SidebarContent className="overflow-y-auto">
							<div className="px-3 pt-3 pb-1">
								<div className="relative">
									<Search
										size={12}
										className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
									/>
									<Input
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										placeholder="Search…"
										className="h-8 pl-7 text-sm"
									/>
								</div>
							</div>
							<SidebarGroup>
								<SidebarGroupContent>
									<SidebarMenu>
										{filtered.map((project) => {
											const isSelected =
												panelState !== "empty" &&
												panelState !== "new" &&
												panelState.id === project.id

											return (
												<SidebarMenuItem key={project.id}>
													<SidebarMenuButton
														isActive={isSelected}
														onClick={() => setPanelState({ id: project.id })}
														className="gap-2 h-auto py-2"
													>
														<span className="flex-1 truncate text-left">
															{project.name}
														</span>
														{project.id === currentProjectId && (
															<Check
																size={11}
																className="shrink-0 text-primary"
															/>
														)}
													</SidebarMenuButton>
												</SidebarMenuItem>
											)
										})}
										{filtered.length === 0 && (
											<p className="px-3 py-2 text-xs text-muted-foreground">
												{search
													? "No matches."
													: "Your projects will appear here."}
											</p>
										)}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						</SidebarContent>
						<SidebarFooter className="p-3 mt-auto">
							{projects.length > 0 && (
								<Button
									variant={panelState === "new" ? "secondary" : "default"}
									size="sm"
									className="w-full gap-1.5"
									onClick={() => setPanelState("new")}
								>
									<Plus size={13} />
									New project
								</Button>
							)}
						</SidebarFooter>
					</Sidebar>

					{/* Right — content */}
					<main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background">
						{!selectedProject && (
							<header className="flex h-12 shrink-0 items-center border-b px-4">
								<span className="text-sm font-medium">
									{panelState === "new" ? "New Project" : "Projects"}
								</span>
							</header>
						)}
						<div className="flex-1 overflow-y-auto p-6 flex flex-col min-h-0">
							{panelState === "new" && (
								<NewProjectPanel
									onCreate={onCreate}
									onCreated={(project) => setPanelState({ id: project.id })}
								/>
							)}
							{panelState === "empty" && (
								<Empty>
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<FolderOpen />
										</EmptyMedia>
										<EmptyTitle>Use projects to organize your work</EmptyTitle>
										<EmptyDescription>
											Create one to get started.
										</EmptyDescription>
									</EmptyHeader>
									<EmptyContent>
										<Button
											variant="default"
											size="sm"
											onClick={() => setPanelState("new")}
										>
											<Plus size={13} />
											New project
										</Button>
									</EmptyContent>
								</Empty>
							)}
							{selectedProject && (
								<EditProjectPanel
									key={selectedProject.id}
									project={selectedProject}
									isCurrent={selectedProject.id === currentProjectId}
									onUpdate={onUpdate}
									onDelete={handleDelete}
									onOpen={() => handleOpen(selectedProject.id)}
								/>
							)}
						</div>
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	)
}
