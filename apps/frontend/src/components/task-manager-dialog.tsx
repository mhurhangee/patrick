import type { ApiTask, TaskType } from "@patrickos/shared"
import { TASK_CONFIGS } from "@patrickos/shared"
import { FolderOpen, Loader2, Search } from "lucide-react"
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
	DialogHeader,
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
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

// ─── Tauri folder picker ──────────────────────────────────────────────────────

async function pickFolderWithTauri(): Promise<string | null> {
	if (typeof window === "undefined") return null
	// biome-ignore lint/suspicious/noExplicitAny: Tauri v2 runtime detection
	if (!(window as any).__TAURI_INTERNALS__) return null
	try {
		const { open } = await import("@tauri-apps/plugin-dialog")
		const result = await open({ directory: true, multiple: false })
		return typeof result === "string" ? result : null
	} catch {
		return null
	}
}

const isTauri =
	typeof window !== "undefined" &&
	// biome-ignore lint/suspicious/noExplicitAny: Tauri v2 runtime detection
	!!(window as any).__TAURI_INTERNALS__

// ─── Save button hook ─────────────────────────────────────────────────────────

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

// ─── Add folder panel ─────────────────────────────────────────────────────────

function AddFolderPanel({
	onCreate,
	onCreated,
}: {
	onCreate: (
		path: string,
		name?: string,
		taskType?: TaskType,
	) => Promise<ApiTask>
	onCreated: (task: ApiTask) => void
}) {
	const [path, setPath] = useState("")
	const [name, setName] = useState("")
	const [taskType, setTaskType] = useState<TaskType | "">("")
	const [picking, setPicking] = useState(false)
	const [creating, setCreating] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [probe, setProbe] = useState<{
		status: "idle" | "checking" | "found" | "missing"
		count: number
	}>({ status: "idle", count: 0 })

	// Probe the typed folder (debounced) — does it exist, how many source docs?
	useEffect(() => {
		const trimmed = path.trim()
		if (!trimmed) {
			setProbe({ status: "idle", count: 0 })
			return
		}
		setProbe((p) => ({ ...p, status: "checking" }))
		const timer = setTimeout(async () => {
			try {
				const { exists, sourceCount } = await api.tasks.probe(trimmed)
				setProbe({
					status: exists ? "found" : "missing",
					count: sourceCount,
				})
			} catch {
				setProbe({ status: "missing", count: 0 })
			}
		}, 400)
		return () => clearTimeout(timer)
	}, [path])

	async function handlePick() {
		setPicking(true)
		try {
			const picked = await pickFolderWithTauri()
			if (picked) {
				setPath(picked)
				if (!name) setName(picked.split("/").at(-1) ?? "")
			}
		} finally {
			setPicking(false)
		}
	}

	async function handleCreate() {
		const trimmedPath = path.trim()
		if (!trimmedPath) return
		setCreating(true)
		setError(null)
		try {
			const task = await onCreate(
				trimmedPath,
				name.trim() || undefined,
				taskType || undefined,
			)
			onCreated(task)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add folder")
		} finally {
			setCreating(false)
		}
	}

	return (
		<>
			<div className="shrink-0 border-b px-6 py-4">
				<h2 className="text-base font-semibold font-heading">
					Add task folder
				</h2>
				<p className="text-xs text-muted-foreground mt-0.5">
					Point PatrickOS at an existing folder on your machine.
				</p>
			</div>

			<div className="flex-1 overflow-y-auto px-6 py-4">
				<div className="flex flex-col gap-4 max-w-md">
					<div className="flex flex-col gap-1.5">
						<Label>Folder path</Label>
						{/* Input is always editable — Browse button additionally available in Tauri */}
						<div className="flex gap-2">
							<Input
								value={path}
								onChange={(e) => setPath(e.target.value)}
								placeholder="/Users/jane/tasks/smith-corp"
								className="font-mono text-xs"
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreate()
								}}
							/>
							{isTauri && (
								<Button
									type="button"
									variant="secondary"
									onClick={handlePick}
									disabled={picking}
								>
									{picking ? (
										<Loader2 size={12} className="animate-spin" />
									) : (
										<>
											<FolderOpen size={12} />
											Browse
										</>
									)}
								</Button>
							)}
						</div>
						{error && <p className="text-xs text-destructive">{error}</p>}
						{path.trim() && probe.status === "checking" && (
							<p className="text-xs text-muted-foreground">Checking folder…</p>
						)}
						{probe.status === "found" && (
							<p className="text-xs text-primary">
								{probe.count > 0
									? `✓ ${probe.count} source document${probe.count === 1 ? "" : "s"} found (PDFs & Word docs)`
									: "✓ Folder found — no PDFs or Word docs yet"}
							</p>
						)}
						{probe.status === "missing" && (
							<p className="text-xs text-amber-600">
								Folder not found — it will be created.
							</p>
						)}
						<p className="text-xs text-muted-foreground">
							Existing files in this folder are never modified.
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Display name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Smith Corp — Office Action 2024"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreate()
							}}
						/>
						<p className="text-xs text-muted-foreground">
							Optional — defaults to folder name.
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Task type</Label>
						<Select
							value={taskType}
							onValueChange={(v) => setTaskType(v as TaskType)}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a task type…" />
							</SelectTrigger>
							<SelectContent>
								{TASK_CONFIGS.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Tells AgentPat what kind of response this task is, so it can
							tailor its help. Optional.
						</p>
					</div>
				</div>
			</div>

			<div className="flex shrink-0 items-center justify-end border-t px-6 py-4">
				<Button
					type="button"
					variant="secondary"
					disabled={!path.trim() || creating}
					onClick={handleCreate}
				>
					{creating ? <Loader2 size={12} className="animate-spin" /> : "Add"}
				</Button>
			</div>
		</>
	)
}

// ─── Edit folder panel ────────────────────────────────────────────────────────

function EditFolderPanel({
	task,
	onRename,
	onSetTaskType,
	onDelete,
}: {
	task: ApiTask
	onRename: (path: string, name: string) => Promise<ApiTask>
	onSetTaskType: (path: string, taskType: TaskType) => Promise<ApiTask>
	onDelete: (path: string) => Promise<void>
}) {
	const [name, setName] = useState(task.name)
	const [savedName, setSavedName] = useState(task.name)
	const [deleteOpen, setDeleteOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const { status, wrap } = useSaveButton()

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on task path only
	useEffect(() => {
		setName(task.name)
		setSavedName(task.name)
	}, [task.path])

	const isDirty = name !== savedName

	async function handleSave() {
		const trimmed = name.trim() || task.name
		const updated = await onRename(task.path, trimmed)
		setSavedName(updated.name)
		setName(updated.name)
	}

	async function handleDelete() {
		setDeleting(true)
		try {
			await onDelete(task.path)
			setDeleteOpen(false)
		} finally {
			setDeleting(false)
		}
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle>Edit Task</DialogTitle>
				<DialogDescription>
					<span className="font-semibold mr-2 ml-2">{savedName}</span>{" "}
					<span className="font-mono">{task.path}</span>
				</DialogDescription>
			</DialogHeader>

			<div className="flex-1 overflow-y-auto px-6 py-4">
				<div className="flex flex-col gap-4 max-w-md">
					<div className="flex flex-col gap-1.5">
						<Label>Display name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && isDirty) wrap(handleSave)
							}}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Task type</Label>
						<Select
							value={task.taskType ?? ""}
							onValueChange={(v) => onSetTaskType(task.path, v as TaskType)}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a task type…" />
							</SelectTrigger>
							<SelectContent>
								{TASK_CONFIGS.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Primes AgentPat and narrows which source types ExtractPat offers.
						</p>
					</div>

					<div className="rounded-md border bg-muted/40 px-4 py-3">
						<p className="text-xs font-medium text-muted-foreground mb-1">
							Folder path
						</p>
						<p className="text-xs font-mono break-all">{task.path}</p>
					</div>
				</div>
			</div>

			<div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
				<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">Remove</Button>
					</AlertDialogTrigger>
					<AlertDialogContent size="sm">
						<AlertDialogHeader>
							<AlertDialogTitle>Remove from list?</AlertDialogTitle>
							<AlertDialogDescription>
								<span className="font-semibold">{savedName}</span> will be
								removed from PatrickOS. Your files are not deleted.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
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
									"Remove"
								)}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<Button
					disabled={!isDirty || status === "saving"}
					onClick={() => wrap(handleSave)}
				>
					{status === "saving" ? (
						<Loader2 size={12} className="animate-spin" />
					) : status === "saved" ? (
						"Saved"
					) : (
						"Save"
					)}
				</Button>
			</div>
		</>
	)
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

type PanelState = "empty" | "new" | { path: string }

export function TaskManagerDialog({
	open,
	onOpenChange,
	tasks,
	currentTaskPath,
	defaultPanel = "empty",
	onSelect,
	onCreate,
	onRename,
	onSetTaskType,
	onDelete,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	tasks: ApiTask[]
	currentTaskPath: string
	defaultPanel?: "empty" | "new"
	onSelect: (path: string) => void
	onCreate: (
		path: string,
		name?: string,
		taskType?: TaskType,
	) => Promise<ApiTask>
	onRename: (path: string, name: string) => Promise<ApiTask>
	onSetTaskType: (path: string, taskType: TaskType) => Promise<ApiTask>
	onDelete: (path: string) => Promise<void>
}) {
	const [panelState, setPanelState] = useState<PanelState>("empty")
	const [search, setSearch] = useState("")

	useEffect(() => {
		if (!open) return
		setSearch("")
		setPanelState(currentTaskPath ? { path: currentTaskPath } : defaultPanel)
	}, [open, currentTaskPath, defaultPanel])

	const filtered = tasks.filter((p) =>
		p.name.toLowerCase().includes(search.toLowerCase()),
	)

	const selectedTask =
		panelState !== "empty" && panelState !== "new"
			? tasks.find((p) => p.path === panelState.path)
			: undefined

	async function handleDelete(path: string) {
		await onDelete(path)
		setPanelState("empty")
	}

	async function handleCreate(
		path: string,
		name?: string,
		taskType?: TaskType,
	) {
		const task = await onCreate(path, name, taskType)
		onSelect(task.path)
		setPanelState({ path: task.path })
		return task
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 h-[560px] md:max-w-[760px] lg:max-w-[900px] flex flex-col">
				<DialogTitle className="sr-only">Tasks</DialogTitle>
				<DialogDescription className="sr-only">
					Manage your task folders.
				</DialogDescription>

				<SidebarProvider
					className="flex-1 h-full min-h-0 items-stretch"
					style={{ "--sidebar-width": "13rem" } as CSSProperties}
				>
					{/* Left — folder list */}
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
										{filtered.map((task) => {
											const isSelected =
												panelState !== "empty" &&
												panelState !== "new" &&
												panelState.path === task.path

											return (
												<SidebarMenuItem key={task.path}>
													<SidebarMenuButton
														onClick={() => {
															setPanelState({ path: task.path })
															onSelect(task.path)
														}}
														className={cn(
															"rounded-none h-auto py-2",
															isSelected
																? "border-l-2 border-primary font-medium"
																: task.path === currentTaskPath
																	? "border-l-2 border-primary/30"
																	: "border-l-2 border-transparent",
														)}
													>
														<span className="flex flex-col gap-0.5 min-w-0 text-left">
															<span className="truncate text-sm">
																{task.name}
															</span>
															<span className="truncate text-[10px] text-muted-foreground font-mono">
																{task.path.split("/").at(-1)}
															</span>
														</span>
													</SidebarMenuButton>
												</SidebarMenuItem>
											)
										})}
										{filtered.length === 0 && (
											<p className="px-3 py-2 text-xs text-muted-foreground">
												{search ? "No matches." : "No folders added yet."}
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
								Add task
							</Button>
						</SidebarFooter>
					</Sidebar>

					{/* Right — content */}
					<main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background">
						{panelState === "empty" ? (
							<div className="flex flex-1 items-center justify-center">
								<Empty>
									<EmptyHeader>
										<EmptyTitle>Select a folder</EmptyTitle>
										<EmptyDescription>
											Pick a task folder or add a new one.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							</div>
						) : panelState === "new" ? (
							<AddFolderPanel
								onCreate={handleCreate}
								onCreated={(p) => setPanelState({ path: p.path })}
							/>
						) : selectedTask ? (
							<EditFolderPanel
								key={selectedTask.path}
								task={selectedTask}
								onRename={onRename}
								onSetTaskType={onSetTaskType}
								onDelete={handleDelete}
							/>
						) : null}
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	)
}
