import type { AssetKind, AssetType } from "@patrickos/db"
import { CalendarDays, Check, Loader2, Trash2 } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { type ApiAsset, api } from "@/lib/api"

// ─── Type options ─────────────────────────────────────────────────────────────

const ASSET_TYPE_OPTIONS: { id: AssetType; label: string; kind: AssetKind }[] =
	[
		{ id: "inventor-disclosure", label: "Inventor Disclosure", kind: "source" },
		{ id: "office-action", label: "Office Action", kind: "source" },
		{ id: "prior-art", label: "Prior Art", kind: "source" },
		{ id: "patent-spec", label: "Patent Specification", kind: "artifact" },
		{ id: "claims-draft", label: "Claims Draft", kind: "artifact" },
		{ id: "response-draft", label: "Response Draft", kind: "artifact" },
	]

function formatDisplayDate(iso: string) {
	if (!iso) return "Pick a date"
	return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}

// ─── Save button ──────────────────────────────────────────────────────────────

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

// ─── Main dialog ──────────────────────────────────────────────────────────────

export function EditAssetDialog({
	asset,
	open,
	onOpenChange,
	onUpdated,
	onDeleted,
}: {
	asset: ApiAsset | undefined
	open: boolean
	onOpenChange: (v: boolean) => void
	onUpdated: (asset: ApiAsset) => void
	onDeleted: (id: string) => void
}) {
	const [title, setTitle] = React.useState("")
	const [type, setType] = React.useState<AssetType>("claims-draft")
	const [date, setDate] = React.useState("")
	const [notes, setNotes] = React.useState("")
	const [savedTitle, setSavedTitle] = React.useState("")
	const [savedType, setSavedType] = React.useState<AssetType>("claims-draft")
	const [savedDate, setSavedDate] = React.useState("")
	const [savedNotes, setSavedNotes] = React.useState("")
	const { status, wrap } = useSaveButton()

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on asset identity
	React.useEffect(() => {
		if (!asset) return
		setTitle(asset.title)
		setType(asset.type)
		setDate(asset.date)
		setNotes(asset.notes)
		setSavedTitle(asset.title)
		setSavedType(asset.type)
		setSavedDate(asset.date)
		setSavedNotes(asset.notes)
	}, [asset?.id])

	const isDirty =
		title !== savedTitle ||
		type !== savedType ||
		date !== savedDate ||
		notes !== savedNotes

	async function handleSave() {
		if (!asset) return
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
		onUpdated(updated)
	}

	const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined
	const typeOptions = ASSET_TYPE_OPTIONS.filter(
		(t) => t.kind === (asset?.kind ?? "artifact"),
	)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[440px]">
				<DialogHeader>
					<DialogTitle>{asset?.title ?? "Edit asset"}</DialogTitle>
					<DialogDescription>
						{asset?.kind === "source" ? "Source document" : "Artifact"}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-asset-title">Title</Label>
						<Input
							id="edit-asset-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && isDirty) wrap(handleSave)
							}}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="edit-asset-type">Type</Label>
						<Select
							value={type}
							onValueChange={(v) => setType(v as AssetType)}
						>
							<SelectTrigger id="edit-asset-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{typeOptions.map((t) => (
									<SelectItem key={t.id} value={t.id}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Date</Label>
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
						<Label htmlFor="edit-asset-notes">Notes</Label>
						<Textarea
							id="edit-asset-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Add notes…"
							className="resize-none"
							rows={3}
						/>
					</div>
				</div>

				<div className="flex items-center justify-between pt-1">
					<Button
						size="sm"
						variant="outline"
						onClick={() => wrap(handleSave)}
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
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</div>

				<Separator />

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="w-fit gap-1.5 text-destructive hover:text-destructive"
						>
							<Trash2 size={13} />
							Delete asset
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent size="sm">
						<AlertDialogHeader>
							<AlertDialogTitle>Delete asset?</AlertDialogTitle>
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
									if (asset) onDeleted(asset.id)
									onOpenChange(false)
								}}
							>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</DialogContent>
		</Dialog>
	)
}
