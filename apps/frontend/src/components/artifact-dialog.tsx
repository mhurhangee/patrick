import type { ApiAsset } from "@patrickos/db"
import { ASSET_CONFIGS, type AssetType } from "@patrickos/db"
import { CalendarDays, Check, Loader2, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

// ─── Constants ────────────────────────────────────────────────────────────────

const ARTIFACT_TYPES = ASSET_CONFIGS.filter((c) => c.kind === "artifact").map(
	(c) => ({ id: c.id, label: c.typeLabel }),
)

function formatDisplayDate(iso: string) {
	if (!iso) return "Pick a date"
	return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}

// ─── Save button hook ─────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved"

function useSaveButton() {
	const [status, setStatus] = useState<SaveStatus>("idle")
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [])

	async function wrap(fn: () => Promise<void>) {
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

// ─── Main dialog ──────────────────────────────────────────────────────────────

export function ArtifactDialog({
	asset,
	open,
	onOpenChange,
	projectId,
	onSaved,
	onDeleted,
}: {
	asset?: ApiAsset
	open: boolean
	onOpenChange: (v: boolean) => void
	projectId: string
	onSaved: (asset: ApiAsset) => void
	onDeleted?: (id: string) => void
}) {
	const isEdit = !!asset

	const [title, setTitle] = useState("")
	const [type, setType] = useState<AssetType>("claims-draft")
	const [date, setDate] = useState("")
	const [notes, setNotes] = useState("")

	// Edit mode: saved values for dirty tracking
	const [savedTitle, setSavedTitle] = useState("")
	const [savedType, setSavedType] = useState<AssetType>("claims-draft")
	const [savedDate, setSavedDate] = useState("")
	const [savedNotes, setSavedNotes] = useState("")

	const [saving, setSaving] = useState(false)
	const { status: saveStatus, wrap: wrapSave } = useSaveButton()

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on open/asset identity
	useEffect(() => {
		if (!open) return
		if (asset) {
			setTitle(asset.title)
			setType(asset.type)
			setDate(asset.date)
			setNotes(asset.notes)
			setSavedTitle(asset.title)
			setSavedType(asset.type)
			setSavedDate(asset.date)
			setSavedNotes(asset.notes)
		} else {
			setTitle("")
			setType("claims-draft")
			setDate("")
			setNotes("")
			setSavedTitle("")
			setSavedType("claims-draft")
			setSavedDate("")
			setSavedNotes("")
		}
		setSaving(false)
	}, [open, asset?.id])

	const isDirty =
		title !== savedTitle ||
		type !== savedType ||
		date !== savedDate ||
		notes !== savedNotes

	const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined

	async function handleSave() {
		if (asset) {
			// Edit mode
			await wrapSave(async () => {
				const updated = await api.assets.update(asset.id, {
					title: title.trim() || "Untitled",
					type,
					date,
					notes,
				})
				setSavedTitle(updated.title)
				setSavedType(updated.type)
				setSavedDate(updated.date)
				setSavedNotes(updated.notes)
				onSaved(updated)
			})
		} else {
			// Add mode: create and close
			setSaving(true)
			try {
				const created = await api.assets.create({
					projectId,
					title: title.trim() || "Untitled",
					kind: "artifact",
					type,
					date,
					notes,
				})
				onSaved(created)
				onOpenChange(false)
			} finally {
				setSaving(false)
			}
		}
	}

	const saveButton = isEdit ? (
		<Button
			size="sm"
			onClick={handleSave}
			disabled={!isDirty || saveStatus === "saving"}
		>
			{saveStatus === "saving" ? (
				<>
					<Loader2 size={12} className="animate-spin" />
					Saving…
				</>
			) : saveStatus === "saved" ? (
				<>
					<Check size={12} />
					Saved
				</>
			) : (
				"Save"
			)}
		</Button>
	) : (
		<Button onClick={handleSave} disabled={saving}>
			{saving ? (
				<>
					<Loader2 size={12} className="animate-spin" />
					Creating…
				</>
			) : (
				"Create artifact"
			)}
		</Button>
	)

	const deleteButton =
		isEdit && onDeleted ? (
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5 text-destructive hover:text-destructive"
					>
						<Trash2 size={13} />
						Delete artifact
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete artifact?</AlertDialogTitle>
						<AlertDialogDescription>
							"{asset?.title}" will be permanently removed. This cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (asset) {
									onDeleted(asset.id)
									onOpenChange(false)
								}
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		) : null

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[440px] flex flex-col overflow-hidden p-0">
				<DialogHeader className="px-6 pt-6 pb-4 shrink-0">
					<DialogTitle>
						{isEdit ? (asset?.title ?? "Edit Artifact") : "New Artifact"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Artifact"
							: "Create a new document to draft in this project."}
					</DialogDescription>
				</DialogHeader>

				{/* Scrollable body */}
				<div
					className="flex-1 overflow-y-auto px-6"
					style={{ maxHeight: "calc(90vh - 10rem)" }}
				>
					<div className="flex flex-col gap-4 pb-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="artifact-title" className="text-xs font-medium">
								Title
							</Label>
							<Input
								id="artifact-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Untitled"
								autoFocus={!isEdit}
								onKeyDown={(e) => {
									if (e.key === "Enter" && (!isEdit || isDirty)) handleSave()
								}}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="artifact-type" className="text-xs font-medium">
								Type
							</Label>
							<Select
								value={type}
								onValueChange={(v) => setType(v as AssetType)}
							>
								<SelectTrigger id="artifact-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ARTIFACT_TYPES.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label className="text-xs font-medium">Date</Label>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className="w-full justify-start font-normal"
									>
										<CalendarDays
											size={14}
											className="mr-1 text-muted-foreground"
										/>
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
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="artifact-notes" className="text-xs font-medium">
								Notes
							</Label>
							<Textarea
								id="artifact-notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder="Add notes…"
								className="resize-y"
								rows={3}
							/>
						</div>
					</div>
				</div>

				{/* Footer — always visible */}
				<div className="flex items-center justify-between px-6 py-4 border-t shrink-0">
					<div>{deleteButton}</div>
					{saveButton}
				</div>
			</DialogContent>
		</Dialog>
	)
}
