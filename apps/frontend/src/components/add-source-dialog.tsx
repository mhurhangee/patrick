import type { AssetType } from "@patrickos/db"
import {
	CalendarDays,
	FileText,
	Loader2,
	Sparkles,
	Upload,
	X,
} from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { type ApiAsset, api } from "@/lib/api"

// ─── Source type config ───────────────────────────────────────────────────────

type SourceAssetType = "office-action" | "prior-art" | "inventor-disclosure"

const SOURCE_TYPES: { id: SourceAssetType; label: string }[] = [
	{ id: "office-action", label: "Office Action" },
	{ id: "prior-art", label: "Prior Art" },
	{ id: "inventor-disclosure", label: "Inventor Disclosure" },
]

const EXTRACTABLE: Set<string> = new Set([
	"office-action",
	"prior-art",
	"inventor-disclosure",
])

function formatDisplayDate(iso: string) {
	if (!iso) return "Pick a date"
	return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}

// ─── Extraction review renderer ───────────────────────────────────────────────

function renderValue(value: unknown, depth = 0): React.ReactNode {
	if (value === null || value === undefined || value === "") {
		return <span className="text-muted-foreground italic">—</span>
	}
	if (Array.isArray(value)) {
		if (value.length === 0)
			return <span className="text-muted-foreground italic">none</span>
		return (
			<ul className="list-disc pl-4 space-y-1">
				{value.map((item, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static extraction result
					<li key={i}>{renderValue(item, depth + 1)}</li>
				))}
			</ul>
		)
	}
	if (typeof value === "object") {
		return (
			<div className={`space-y-1 ${depth > 0 ? "pl-2 border-l ml-1" : ""}`}>
				{Object.entries(value as Record<string, unknown>).map(([k, v]) => (
					<div key={k} className="flex gap-2">
						<span className="text-muted-foreground text-xs shrink-0 w-28 pt-0.5">
							{k
								.replace(/([A-Z])/g, " $1")
								.replace(/^./, (s) => s.toUpperCase())}
						</span>
						<span className="text-xs flex-1">{renderValue(v, depth + 1)}</span>
					</div>
				))}
			</div>
		)
	}
	return <span className="text-xs">{String(value)}</span>
}

function ExtractionReview({ data }: { data: Record<string, unknown> }) {
	return (
		<div className="space-y-3">
			{Object.entries(data).map(([key, value]) => (
				<div key={key}>
					<p className="text-xs font-medium mb-1">
						{key
							.replace(/([A-Z])/g, " $1")
							.replace(/^./, (s) => s.toUpperCase())}
					</p>
					<div className="rounded-md bg-muted/50 px-3 py-2">
						{renderValue(value)}
					</div>
				</div>
			))}
		</div>
	)
}

// ─── PDF drop zone ────────────────────────────────────────────────────────────

function PdfDropZone({
	file,
	onFile,
}: {
	file: File | null
	onFile: (f: File) => void
}) {
	const inputRef = React.useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = React.useState(false)
	const objectUrl = React.useMemo(
		() => (file ? URL.createObjectURL(file) : null),
		[file],
	)

	React.useEffect(() => {
		return () => {
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	}, [objectUrl])

	if (objectUrl) {
		return (
			<iframe
				src={objectUrl}
				title="PDF preview"
				className="w-full h-full border-0"
			/>
		)
	}

	return (
		<button
			type="button"
			className={`flex flex-col items-center justify-center w-full h-full gap-4 border-2 border-dashed rounded-lg transition-colors cursor-pointer text-center px-6
				${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}`}
			onDragOver={(e) => {
				e.preventDefault()
				setDragging(true)
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={(e) => {
				e.preventDefault()
				setDragging(false)
				const f = e.dataTransfer.files[0]
				if (f?.type === "application/pdf") onFile(f)
			}}
			onClick={() => inputRef.current?.click()}
		>
			<input
				ref={inputRef}
				type="file"
				accept=".pdf,application/pdf"
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0]
					if (f) onFile(f)
				}}
			/>
			<Upload
				size={32}
				className="text-muted-foreground/40"
			/>
			<div>
				<p className="text-sm font-medium">Drop PDF here</p>
				<p className="text-xs text-muted-foreground mt-1">or click to browse</p>
			</div>
		</button>
	)
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

type Step = "upload" | "extracting" | "review"

export function AddSourceDialog({
	open,
	onOpenChange,
	projectId,
	provider,
	apiKey,
	model,
	onCreated,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	projectId: string
	provider: string
	apiKey: string
	model: string
	onCreated: (asset: ApiAsset) => void
}) {
	const [step, setStep] = React.useState<Step>("upload")
	const [file, setFile] = React.useState<File | null>(null)
	const [title, setTitle] = React.useState("")
	const [type, setType] = React.useState<AssetType>("office-action")
	const [date, setDate] = React.useState("")
	const [notes, setNotes] = React.useState("")
	const [saving, setSaving] = React.useState(false)
	const [createdAsset, setCreatedAsset] = React.useState<ApiAsset | null>(null)
	const [extracted, setExtracted] = React.useState<Record<
		string,
		unknown
	> | null>(null)
	const [extractError, setExtractError] = React.useState<string | null>(null)

	function reset() {
		setStep("upload")
		setFile(null)
		setTitle("")
		setType("office-action")
		setDate("")
		setNotes("")
		setSaving(false)
		setCreatedAsset(null)
		setExtracted(null)
		setExtractError(null)
	}

	function handleOpenChange(v: boolean) {
		if (!v) reset()
		onOpenChange(v)
	}

	function handleFile(f: File) {
		setFile(f)
		if (!title) setTitle(f.name.replace(/\.pdf$/i, ""))
	}

	async function uploadAsset(): Promise<ApiAsset> {
		const formData = new FormData()
		if (file) formData.append("file", file)
		formData.append("projectId", projectId)
		formData.append(
			"title",
			title.trim() || file?.name.replace(/\.pdf$/i, "") || "Untitled",
		)
		formData.append("type", type)
		formData.append("kind", "source")
		formData.append("date", date)
		formData.append("notes", notes)
		return api.assets.createSource(formData)
	}

	async function handleSave() {
		if (!file) return
		setSaving(true)
		try {
			const asset = await uploadAsset()
			onCreated(asset)
			handleOpenChange(false)
		} finally {
			setSaving(false)
		}
	}

	async function handleSaveAndExtract() {
		if (!file) return
		setSaving(true)
		setStep("extracting")
		setExtractError(null)
		try {
			const asset = await uploadAsset()
			setCreatedAsset(asset)
			const result = await api.extractpat.extract(
				asset.id,
				provider,
				apiKey,
				model,
			)
			setExtracted(result.extracted)
			setStep("review")
		} catch (err) {
			setExtractError(
				err instanceof Error ? err.message : "Extraction failed.",
			)
			setStep("upload")
		} finally {
			setSaving(false)
		}
	}

	async function handleSaveExtraction() {
		if (!createdAsset || !extracted) return
		setSaving(true)
		try {
			const updated = await api.assets.update(createdAsset.id, {
				extractedData: JSON.stringify(extracted),
			})
			onCreated(updated)
			handleOpenChange(false)
		} finally {
			setSaving(false)
		}
	}

	async function handleSkipExtraction() {
		if (!createdAsset) return
		onCreated(createdAsset)
		handleOpenChange(false)
	}

	const canExtract = EXTRACTABLE.has(type) && !!apiKey

	const selectedDate = date ? new Date(`${date}T00:00:00`) : undefined

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="overflow-hidden p-0 md:max-h-[680px] md:max-w-[900px]">
				<DialogTitle className="sr-only">Add Source</DialogTitle>
				<DialogDescription className="sr-only">
					Upload a PDF source document.
				</DialogDescription>

				<div className="flex h-[640px]">
					{/* Left — PDF preview */}
					<div className="w-[45%] border-r bg-muted/30 p-3">
						<PdfDropZone file={file} onFile={handleFile} />
					</div>

					{/* Right — form / review */}
					<div className="flex flex-1 flex-col overflow-hidden">
						{/* Header */}
						<div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
							<span className="text-sm font-medium">
								{step === "review" ? "Review extraction" : "Add Source"}
							</span>
							{step === "extracting" && (
								<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<Loader2 size={12} className="animate-spin" />
									Extracting…
								</div>
							)}
						</div>

						{/* Body */}
						<ScrollArea className="flex-1">
							<div className="flex flex-col gap-4 p-4">
								{step === "upload" && (
									<>
										{extractError && (
											<p className="text-xs text-destructive rounded-md bg-destructive/10 px-3 py-2">
												{extractError}
											</p>
										)}
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="source-title">Title</Label>
											<Input
												id="source-title"
												value={title}
												onChange={(e) => setTitle(e.target.value)}
												placeholder="Untitled"
											/>
										</div>
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="source-type">Type</Label>
											<Select
												value={type}
												onValueChange={(v) => setType(v as AssetType)}
											>
												<SelectTrigger id="source-type">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{SOURCE_TYPES.map((t) => (
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
											<Label htmlFor="source-notes">Notes</Label>
											<Textarea
												id="source-notes"
												value={notes}
												onChange={(e) => setNotes(e.target.value)}
												placeholder="Add notes…"
												className="resize-none"
												rows={3}
											/>
										</div>
									</>
								)}

								{step === "extracting" && (
									<div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
										<Loader2 size={28} className="animate-spin" />
										<p className="text-sm">Analysing document…</p>
									</div>
								)}

								{step === "review" && extracted && (
									<>
										<div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2.5">
											<Sparkles
												size={14}
												className="text-primary mt-0.5 shrink-0"
											/>
											<p className="text-xs text-muted-foreground leading-relaxed">
												Review the extracted data below. This will be saved with
												the document and used to provide context to AI features.
											</p>
										</div>
										<ExtractionReview data={extracted} />
									</>
								)}
							</div>
						</ScrollArea>

						{/* Footer */}
						<div className="shrink-0 border-t px-4 py-3">
							{step === "upload" && (
								<div className="flex items-center gap-2">
									{!file && (
										<div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-auto">
											<FileText size={13} />
											No file selected
										</div>
									)}
									{file && (
										<button
											type="button"
											onClick={() => setFile(null)}
											className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mr-auto"
										>
											<X size={11} />
											{file.name}
										</button>
									)}
									<Button
										size="sm"
										variant="outline"
										onClick={handleSave}
										disabled={!file || saving}
									>
										{saving ? (
											<>
												<Loader2 size={12} className="animate-spin" />
												Saving…
											</>
										) : (
											"Save"
										)}
									</Button>
									{canExtract && (
										<Button
											size="sm"
											onClick={handleSaveAndExtract}
											disabled={!file || saving}
										>
											{saving ? (
												<>
													<Loader2 size={12} className="animate-spin" />
													Uploading…
												</>
											) : (
												<>
													<Sparkles size={12} />
													Save & Extract
												</>
											)}
										</Button>
									)}
								</div>
							)}

							{step === "review" && (
								<div className="flex items-center gap-2 justify-end">
									<Button
										size="sm"
										variant="outline"
										onClick={handleSkipExtraction}
										disabled={saving}
									>
										Skip
									</Button>
									<Button
										size="sm"
										onClick={handleSaveExtraction}
										disabled={saving}
									>
										{saving ? (
											<>
												<Loader2 size={12} className="animate-spin" />
												Saving…
											</>
										) : (
											"Save with extraction"
										)}
									</Button>
								</div>
							)}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
