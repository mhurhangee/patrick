import {
	type ApiProject,
	PROJECT_CONFIGS,
	type ProjectType,
} from "@patrickos/db"
import { Loader2, Search } from "lucide-react"
import { type CSSProperties, useEffect, useRef, useState } from "react"
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
	EmptyDescription,
	EmptyHeader,
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProjectConfig(id: ProjectType) {
	return PROJECT_CONFIGS.find((c) => c.id === id)
}

type SaveStatus = "idle" | "saving" | "saved"

function useSaveButton() {
	const [status, setStatus] = useState<SaveStatus>("idle")
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		},
		[],
	)

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

// ─── Unified project form ─────────────────────────────────────────────────────

type ProjectPatch = {
	name?: string
	type?: ProjectType
	clientName?: string
	clientIndustry?: string
	clientPreferences?: string
}

function ProjectForm({
	project,
	onCreate,
	onCreated,
	onUpdate,
	onDelete,
}: {
	project?: ApiProject
	onCreate?: (name: string, type: ProjectType) => Promise<ApiProject>
	onCreated?: (project: ApiProject) => void
	onUpdate?: (id: string, patch: ProjectPatch) => Promise<ApiProject>
	onDelete?: (id: string) => Promise<void>
}) {
	const isEdit = !!project

	const [name, setName] = useState(project?.name ?? "")
	const [type, setType] = useState<ProjectType>(
		project?.type ?? PROJECT_CONFIGS[0].id,
	)
	const [clientName, setClientName] = useState(project?.clientName ?? "")
	const [clientIndustry, setClientIndustry] = useState(
		project?.clientIndustry ?? "",
	)
	const [clientPreferences, setClientPreferences] = useState(
		project?.clientPreferences ?? "",
	)

	const [savedName, setSavedName] = useState(project?.name ?? "")
	const [savedType, setSavedType] = useState<ProjectType>(
		project?.type ?? PROJECT_CONFIGS[0].id,
	)
	const [savedClientName, setSavedClientName] = useState(
		project?.clientName ?? "",
	)
	const [savedClientIndustry, setSavedClientIndustry] = useState(
		project?.clientIndustry ?? "",
	)
	const [savedClientPreferences, setSavedClientPreferences] = useState(
		project?.clientPreferences ?? "",
	)

	const [creating, setCreating] = useState(false)
	const [deleteOpen, setDeleteOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const { status: saveStatus, wrap } = useSaveButton()

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on project identity only
	useEffect(() => {
		setName(project?.name ?? "")
		setType(project?.type ?? PROJECT_CONFIGS[0].id)
		setClientName(project?.clientName ?? "")
		setClientIndustry(project?.clientIndustry ?? "")
		setClientPreferences(project?.clientPreferences ?? "")
		setSavedName(project?.name ?? "")
		setSavedType(project?.type ?? PROJECT_CONFIGS[0].id)
		setSavedClientName(project?.clientName ?? "")
		setSavedClientIndustry(project?.clientIndustry ?? "")
		setSavedClientPreferences(project?.clientPreferences ?? "")
	}, [project?.id])

	const isDirty =
		isEdit &&
		(name !== savedName ||
			type !== savedType ||
			clientName !== savedClientName ||
			clientIndustry !== savedClientIndustry ||
			clientPreferences !== savedClientPreferences)

	async function handleCreate() {
		if (!onCreate || !onCreated) return
		const trimmed = name.trim()
		if (!trimmed) return
		setCreating(true)
		try {
			const created = await onCreate(trimmed, type)
			onCreated(created)
		} finally {
			setCreating(false)
		}
	}

	async function handleSave() {
		if (!project || !onUpdate) return
		const updated = await onUpdate(project.id, {
			name: name.trim() || project.name,
			type,
			clientName,
			clientIndustry,
			clientPreferences,
		})
		setSavedName(updated.name)
		setSavedType(updated.type)
		setSavedClientName(updated.clientName)
		setSavedClientIndustry(updated.clientIndustry)
		setSavedClientPreferences(updated.clientPreferences)
	}

	async function handleDelete() {
		if (!project || !onDelete) return
		setDeleting(true)
		try {
			await onDelete(project.id)
			setDeleteOpen(false)
		} finally {
			setDeleting(false)
		}
	}

	return (
		<>
			{/* Sticky header */}
			<div className="shrink-0 border-b px-6 py-4">
				<h2 className="text-base font-semibold font-heading">
					{isEdit ? "Edit Project" : "New Project"}
				</h2>
				<p className="text-xs text-muted-foreground mt-0.5">
					{isEdit
						? project.name
						: "Fill in the details to create a new matter."}
				</p>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto px-6 py-4">
				<div className="flex flex-col gap-4 max-w-md">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="project-name">Name</Label>
						<Input
							id="project-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Smith Corp — Office Action 2024"
							autoFocus={!isEdit}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									if (isEdit && isDirty) wrap(handleSave)
									else if (!isEdit) handleCreate()
								}
							}}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="project-type">Type</Label>
						<Select
							value={type}
							onValueChange={(v) => setType(v as ProjectType)}
						>
							<SelectTrigger id="project-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PROJECT_CONFIGS.map((cfg) => (
									<SelectItem key={cfg.id} value={cfg.id}>
										{cfg.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							{getProjectConfig(type)?.description}
						</p>
					</div>

					<Separator />

					<div className="flex flex-col gap-1">
						<h3 className="text-sm font-medium">Client</h3>
						<p className="text-xs text-muted-foreground">
							Included in AI context for this project.
						</p>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="project-client-name">Client name</Label>
							<Input
								id="project-client-name"
								value={clientName}
								onChange={(e) => setClientName(e.target.value)}
								placeholder="Acme Corp"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="project-client-industry">Industry</Label>
							<Input
								id="project-client-industry"
								value={clientIndustry}
								onChange={(e) => setClientIndustry(e.target.value)}
								placeholder="Consumer electronics"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="project-client-preferences">Preferences</Label>
						<Textarea
							id="project-client-preferences"
							value={clientPreferences}
							onChange={(e) => setClientPreferences(e.target.value)}
							placeholder="Broad initial claims, conservative on amendments…"
							className="min-h-[80px] text-sm"
						/>
					</div>
				</div>
			</div>

			{/* Sticky footer */}
			<div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
				{isEdit && onDelete ? (
					<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
						<AlertDialogTrigger asChild>
							<Button variant="destructive">Delete</Button>
						</AlertDialogTrigger>
						<AlertDialogContent size="sm">
							<AlertDialogHeader>
								<AlertDialogTitle>Delete project?</AlertDialogTitle>
								<AlertDialogDescription>
									<span className="font-semibold">{project.name}</span> and all
									its contents will be permanently deleted. This cannot be
									undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={deleting}>
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									disabled={deleting}
									onClick={(e) => {
										e.preventDefault()
										handleDelete()
									}}
								>
									{deleting ? (
										<Loader2 size={12} className="animate-spin" />
									) : (
										"Delete"
									)}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				) : (
					<div />
				)}

				{isEdit ? (
					<Button
						variant="outline"
						disabled={!isDirty || saveStatus === "saving"}
						onClick={() => wrap(handleSave)}
					>
						{saveStatus === "saving" ? (
							<Loader2 size={12} className="animate-spin" />
						) : saveStatus === "saved" ? (
							"Saved"
						) : (
							"Save"
						)}
					</Button>
				) : (
					<Button
						variant="secondary"
						disabled={!name.trim() || creating}
						onClick={handleCreate}
					>
						{creating ? (
							<Loader2 size={12} className="animate-spin" />
						) : (
							"Create"
						)}
					</Button>
				)}
			</div>
		</>
	)
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

type PanelState = "empty" | "new" | { id: string }

export function ProjectManagerDialog({
	open,
	onOpenChange,
	projects,
	currentProjectId,
	defaultPanel = "empty",
	onSelect,
	onCreate,
	onUpdate,
	onDelete,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	projects: ApiProject[]
	currentProjectId: string
	defaultPanel?: "empty" | "new"
	onSelect: (id: string) => void
	onCreate: (name: string, type: ProjectType) => Promise<ApiProject>
	onUpdate: (id: string, patch: ProjectPatch) => Promise<ApiProject>
	onDelete: (id: string) => Promise<void>
}) {
	const [panelState, setPanelState] = useState<PanelState>("empty")
	const [search, setSearch] = useState("")

	useEffect(() => {
		if (!open) return
		setSearch("")
		setPanelState(currentProjectId ? { id: currentProjectId } : defaultPanel)
	}, [open, currentProjectId, defaultPanel])

	const filtered = projects.filter((p) =>
		p.name.toLowerCase().includes(search.toLowerCase()),
	)

	const selectedProject =
		panelState !== "empty" && panelState !== "new"
			? projects.find((p) => p.id === panelState.id)
			: undefined

	async function handleDelete(id: string) {
		await onDelete(id)
		setPanelState("empty")
	}

	async function handleCreate(name: string, type: ProjectType) {
		const project = await onCreate(name, type)
		onSelect(project.id)
		return project
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 h-[600px] md:max-w-[760px] lg:max-w-[900px] flex flex-col">
				<DialogTitle className="sr-only">Projects</DialogTitle>
				<DialogDescription className="sr-only">
					Manage your patent matters.
				</DialogDescription>

				<SidebarProvider
					className="flex-1 h-full min-h-0 items-stretch"
					style={{ "--sidebar-width": "13rem" } as CSSProperties}
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
														onClick={() => {
															setPanelState({ id: project.id })
															onSelect(project.id)
														}}
														className={cn(
															"rounded-none h-auto py-2",
															isSelected
																? "border-l-2 border-primary font-medium"
																: project.id === currentProjectId
																	? "border-l-2 border-primary/30"
																	: "border-l-2 border-transparent",
														)}
													>
														<span className="flex-1 truncate text-left">
															{project.name}
														</span>
													</SidebarMenuButton>
												</SidebarMenuItem>
											)
										})}
										{filtered.length === 0 && (
											<p className="px-3 py-2 text-xs text-muted-foreground">
												{search ? "No matches." : "No projects yet."}
											</p>
										)}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						</SidebarContent>
						<SidebarFooter className="p-3">
							<Button
								variant="secondary"
								className="w-full"
								onClick={() => setPanelState("new")}
							>
								New project
							</Button>
						</SidebarFooter>
					</Sidebar>

					{/* Right — content */}
					<main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background">
						{panelState === "empty" ? (
							<div className="flex flex-1 items-center justify-center">
								<Empty>
									<EmptyHeader>
										<EmptyTitle>Select a project</EmptyTitle>
										<EmptyDescription>
											Pick one from the list or create a new one.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							</div>
						) : panelState === "new" ? (
							<ProjectForm
								onCreate={handleCreate}
								onCreated={(project) => setPanelState({ id: project.id })}
							/>
						) : selectedProject ? (
							<ProjectForm
								key={selectedProject.id}
								project={selectedProject}
								onUpdate={onUpdate}
								onDelete={handleDelete}
							/>
						) : null}
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	)
}
