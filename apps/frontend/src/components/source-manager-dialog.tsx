import type { ApiAsset, ApiTask, DocMeta, TaskType } from "@patrickos/shared"
import { TASK_CONFIGS } from "@patrickos/shared"
import { Ban, Eye, Star } from "lucide-react"
import { useEffect, useState } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { TagEditor } from "./tag-editor"

// One document row — name + type, star/exclude toggles, signpost, tags. The
// signpost is local-edited and saved on blur (this is a deliberate editing
// surface, not live typing into context).
function ManagerRow({
	asset,
	meta,
	excluded,
	starred,
	onToggleStar,
	onToggleExclude,
	onSignpost,
	onTags,
}: {
	asset: ApiAsset
	meta: DocMeta | undefined
	excluded: boolean
	starred: boolean
	onToggleStar: () => void
	onToggleExclude: () => void
	onSignpost: (value: string) => void
	onTags: (tags: string[]) => void
}) {
	const [signpost, setSignpost] = useState(meta?.signpost ?? "")
	// Reflect external changes (e.g. AgentPat suggestions) into the field.
	useEffect(() => {
		setSignpost(meta?.signpost ?? "")
	}, [meta?.signpost])
	const label = asset.kind === "artifact" ? asset.title : asset.filename

	// One dense row: star · name · signpost · tags · exclude — table-like columns.
	return (
		<div className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/40">
			<button
				type="button"
				onClick={onToggleStar}
				title={starred ? "Unstar" : "Star"}
				className={cn(
					"shrink-0",
					starred
						? "text-foreground"
						: "text-muted-foreground/40 hover:text-foreground",
				)}
			>
				<Star size={12} />
			</button>
			<span
				className={cn(
					"w-40 shrink-0 truncate",
					asset.kind === "artifact" && "capitalize",
					excluded && "text-muted-foreground/40 line-through",
				)}
				title={label}
			>
				{label}
			</span>
			<input
				type="text"
				value={signpost}
				onChange={(e) => setSignpost(e.target.value)}
				onBlur={() => onSignpost(signpost)}
				placeholder="signpost…"
				className="min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-muted-foreground/40"
			/>
			<TagEditor
				tags={meta?.tags ?? []}
				onChange={onTags}
				className="w-48 shrink-0"
			/>
			<button
				type="button"
				onClick={onToggleExclude}
				title={excluded ? "Include in AgentPat" : "Exclude from AgentPat"}
				className={cn(
					"shrink-0",
					excluded
						? "text-destructive/70 hover:text-destructive"
						: "text-muted-foreground/40 hover:text-foreground",
				)}
			>
				{excluded ? <Ban size={12} /> : <Eye size={12} />}
			</button>
		</div>
	)
}

// Bulk source/artifact triage for the current task: set the task type, then
// signpost / tag / star / exclude every document in one place.
export function SourceManagerDialog({
	open,
	onOpenChange,
	assets,
	docMeta,
	currentTaskPath,
	tasks,
	onSetTaskType,
	doNotRead,
	starred,
	onToggleDoNotRead,
	onToggleStar,
	onSetSignpost,
	onSetTags,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	assets: ApiAsset[]
	docMeta: Record<string, DocMeta>
	currentTaskPath: string
	tasks: ApiTask[]
	onSetTaskType: (path: string, taskType: TaskType) => void
	doNotRead: Set<string>
	starred: Set<string>
	onToggleDoNotRead: (id: string) => void
	onToggleStar: (id: string) => void
	onSetSignpost: (filename: string, value: string) => void
	onSetTags: (filename: string, tags: string[]) => void
}) {
	const taskType = tasks.find((t) => t.path === currentTaskPath)?.taskType ?? ""
	const sources = assets.filter((a) => a.kind === "source")
	const artifacts = assets.filter((a) => a.kind === "artifact")

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
				<DialogHeader className="border-b px-6 py-4">
					<DialogTitle>Manage task documents</DialogTitle>
					<DialogDescription>
						Set the task type, then signpost, tag, star or exclude each
						document. Signposts and tags are what AgentPat sees for closed
						documents.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-1.5 border-b px-6 py-4">
					<Label>Task type</Label>
					<Select
						value={taskType}
						onValueChange={(v) => onSetTaskType(currentTaskPath, v as TaskType)}
					>
						<SelectTrigger className="max-w-sm">
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
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
					{assets.length === 0 ? (
						<p className="py-6 text-center text-xs text-muted-foreground">
							No documents in this task yet.
						</p>
					) : (
						<>
							{sources.length > 0 && (
								<p className="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									Sources
								</p>
							)}
							{sources.map((asset) => (
								<ManagerRow
									key={asset.id}
									asset={asset}
									meta={docMeta[asset.filename]}
									excluded={doNotRead.has(asset.id)}
									starred={starred.has(asset.id)}
									onToggleStar={() => onToggleStar(asset.id)}
									onToggleExclude={() => onToggleDoNotRead(asset.id)}
									onSignpost={(v) => onSetSignpost(asset.filename, v)}
									onTags={(t) => onSetTags(asset.filename, t)}
								/>
							))}
							{artifacts.length > 0 && (
								<p className="px-1 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									Artifacts
								</p>
							)}
							{artifacts.map((asset) => (
								<ManagerRow
									key={asset.id}
									asset={asset}
									meta={docMeta[asset.filename]}
									excluded={doNotRead.has(asset.id)}
									starred={starred.has(asset.id)}
									onToggleStar={() => onToggleStar(asset.id)}
									onToggleExclude={() => onToggleDoNotRead(asset.id)}
									onSignpost={(v) => onSetSignpost(asset.filename, v)}
									onTags={(t) => onSetTags(asset.filename, t)}
								/>
							))}
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
