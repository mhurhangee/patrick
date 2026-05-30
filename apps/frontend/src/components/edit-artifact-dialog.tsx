import {
	type ApiAsset,
	ASSET_CONFIGS,
	type AssetType,
	PROJECT_CONFIGS,
	type ProjectType,
} from "@patrickos/db"
import { Loader2 } from "lucide-react"
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

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

export function EditArtifactDialog({
	asset,
	open,
	onOpenChange,
	projectType,
	onSaved,
	onDeleted,
}: {
	asset: ApiAsset
	open: boolean
	onOpenChange: (v: boolean) => void
	projectType: ProjectType
	onSaved: (asset: ApiAsset) => void
	onDeleted: (id: string) => void
}) {
	const allowedTypes = PROJECT_CONFIGS.find(
		(c) => c.id === projectType,
	)?.allowedAssetTypes
	const artifactTypes = ASSET_CONFIGS.filter(
		(c) => c.kind === "artifact" && allowedTypes?.includes(c.id),
	).map((c) => ({ id: c.id, label: c.typeLabel }))

	const [title, setTitle] = useState(asset.title)
	const [type, setType] = useState<AssetType>(asset.type)
	const [date, setDate] = useState(asset.date)
	const [notes, setNotes] = useState(asset.notes)
	const [savedTitle, setSavedTitle] = useState(asset.title)
	const [savedType, setSavedType] = useState<AssetType>(asset.type)
	const [savedDate, setSavedDate] = useState(asset.date)
	const [savedNotes, setSavedNotes] = useState(asset.notes)
	const [deleteOpen, setDeleteOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const { status: saveStatus, wrap } = useSaveButton()

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on open/asset identity
	useEffect(() => {
		if (!open) return
		setTitle(asset.title)
		setType(asset.type)
		setDate(asset.date)
		setNotes(asset.notes)
		setSavedTitle(asset.title)
		setSavedType(asset.type)
		setSavedDate(asset.date)
		setSavedNotes(asset.notes)
		setDeleteOpen(false)
		setDeleting(false)
	}, [open, asset.id])

	const isDirty =
		title !== savedTitle ||
		type !== savedType ||
		date !== savedDate ||
		notes !== savedNotes

	async function handleSave() {
		await wrap(async () => {
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
	}

	async function handleDelete() {
		setDeleting(true)
		try {
			await api.assets.delete(asset.id)
			onDeleted(asset.id)
			setDeleteOpen(false)
			onOpenChange(false)
		} finally {
			setDeleting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex flex-col overflow-hidden p-0 sm:max-w-[440px]">
				<DialogHeader className="shrink-0 border-b px-6 py-4">
					<DialogTitle>Edit Artifact</DialogTitle>
					<DialogDescription>{asset.title}</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto px-6 py-4">
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="artifact-title">Title</Label>
							<Input
								id="artifact-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && isDirty) handleSave()
								}}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="artifact-type">Type</Label>
							<Select
								value={type}
								onValueChange={(v) => setType(v as AssetType)}
							>
								<SelectTrigger id="artifact-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{artifactTypes.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="artifact-date">Date</Label>
							<Input
								id="artifact-date"
								value={date}
								onChange={(e) => setDate(e.target.value)}
								placeholder="YYYY-MM-DD"
								className={
									date && !DATE_RE.test(date) ? "border-destructive" : ""
								}
							/>
							{date && !DATE_RE.test(date) && (
								<p className="text-xs text-destructive">
									Use YYYY-MM-DD format
								</p>
							)}
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="artifact-notes">Notes</Label>
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

				<div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
					<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
						<AlertDialogTrigger asChild>
							<Button variant="destructive">Delete</Button>
						</AlertDialogTrigger>
						<AlertDialogContent size="sm">
							<AlertDialogHeader>
								<AlertDialogTitle>Delete artifact?</AlertDialogTitle>
								<AlertDialogDescription>
									<span className="font-semibold">{asset.title}</span> will be
									permanently removed. This cannot be undone.
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

					<Button
						variant="outline"
						disabled={!isDirty || saveStatus === "saving"}
						onClick={handleSave}
					>
						{saveStatus === "saving" ? (
							<Loader2 size={12} className="animate-spin" />
						) : saveStatus === "saved" ? (
							"Saved"
						) : (
							"Save"
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
