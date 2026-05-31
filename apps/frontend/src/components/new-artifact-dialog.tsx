import {
	type ApiAsset,
	ASSET_CONFIGS,
	type AssetType,
	PROJECT_CONFIGS,
	type ProjectType,
} from "@patrickos/db"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function NewArtifactDialog({
	open,
	onOpenChange,
	projectId,
	projectType,
	onCreated,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	projectId: string
	projectType: ProjectType
	onCreated: (asset: ApiAsset) => void
}) {
	const allowedTypes = PROJECT_CONFIGS.find(
		(c) => c.id === projectType,
	)?.allowedAssetTypes
	const artifactTypes = ASSET_CONFIGS.filter(
		(c) => c.kind === "artifact" && allowedTypes?.includes(c.id),
	).map((c) => ({ id: c.id, label: c.typeLabel }))
	const defaultType = artifactTypes[0]?.id ?? "us-amended-claims"

	const [title, setTitle] = useState("")
	const [type, setType] = useState<AssetType>(defaultType)
	const [date, setDate] = useState("")
	const [notes, setNotes] = useState("")
	const [creating, setCreating] = useState(false)

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on open only
	useEffect(() => {
		if (!open) return
		setTitle("")
		setType(defaultType)
		setDate("")
		setNotes("")
		setCreating(false)
	}, [open])

	async function handleCreate() {
		setCreating(true)
		try {
			const created = await api.assets.create({
				projectId,
				title: title.trim() || "Untitled",
				kind: "artifact",
				type,
				date,
				notes,
			})
			onCreated(created)
			onOpenChange(false)
		} finally {
			setCreating(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex flex-col overflow-hidden p-0 sm:max-w-[440px]">
				<DialogHeader>
					<DialogTitle>New Artifact</DialogTitle>
					<DialogDescription>
						Create a new document to draft in this project.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto px-6 py-4">
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="artifact-title">Title</Label>
							<Input
								id="artifact-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Untitled"
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreate()
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

				<div className="flex shrink-0 items-center justify-end border-t px-6 py-4">
					<Button
						onClick={handleCreate}
						disabled={creating}
						variant="secondary"
					>
						{creating ? (
							<Loader2 size={12} className="animate-spin" />
						) : (
							"Create"
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
