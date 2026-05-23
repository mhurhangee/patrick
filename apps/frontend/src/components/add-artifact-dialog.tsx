import type { AssetType } from "@patrickos/db"
import { CalendarDays, Loader2 } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { type ApiAsset, api } from "@/lib/api"

const ARTIFACT_TYPES: { id: AssetType; label: string }[] = [
	{ id: "patent-spec", label: "Patent Specification" },
	{ id: "claims-draft", label: "Claims Draft" },
	{ id: "response-draft", label: "Response Draft" },
]

function formatDisplayDate(iso: string) {
	if (!iso) return "Pick a date"
	return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}

export function AddArtifactDialog({
	open,
	onOpenChange,
	projectId,
	onCreated,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	projectId: string
	onCreated: (asset: ApiAsset) => void
}) {
	const [title, setTitle] = React.useState("")
	const [type, setType] = React.useState<AssetType>("claims-draft")
	const [date, setDate] = React.useState("")
	const [notes, setNotes] = React.useState("")
	const [saving, setSaving] = React.useState(false)

	function reset() {
		setTitle("")
		setType("claims-draft")
		setDate("")
		setNotes("")
		setSaving(false)
	}

	function handleOpenChange(v: boolean) {
		if (!v) reset()
		onOpenChange(v)
	}

	async function handleCreate() {
		setSaving(true)
		try {
			const asset = await api.assets.create({
				projectId,
				title: title.trim() || "Untitled",
				kind: "artifact",
				type,
				date,
				notes,
			})
			onCreated(asset)
			handleOpenChange(false)
		} finally {
			setSaving(false)
		}
	}

	const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[440px]">
				<DialogHeader>
					<DialogTitle>New Artifact</DialogTitle>
					<DialogDescription>
						Create a new document to draft in this project.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
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
								{ARTIFACT_TYPES.map((t) => (
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
						<Label htmlFor="artifact-notes">Notes</Label>
						<Textarea
							id="artifact-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Add notes…"
							className="resize-none"
							rows={3}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button onClick={handleCreate} disabled={saving}>
						{saving ? (
							<>
								<Loader2 size={12} className="animate-spin" />
								Creating…
							</>
						) : (
							"Create artifact"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
