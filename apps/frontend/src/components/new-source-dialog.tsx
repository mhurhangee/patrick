import type { ApiAsset } from "@patrickos/db"
import {
	ASSET_CONFIGS,
	type AssetType,
	emptyDetails,
	extractLocationMap,
	type FieldLocation,
	type FieldMeta,
	getFormFields,
	isExtractable,
	mergeExtracted,
	PROJECT_CONFIGS,
	type ProjectType,
} from "@patrickos/db"
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Clover,
	FileText,
	Loader2,
	Upload,
	X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { SourceViewerHighlight } from "./source-viewer"
import { SourceViewer } from "./source-viewer"

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "upload" | "processing" | "review" | "final"

// ─── Zone → y% ranges ────────────────────────────────────────────────────────

const ZONE_RANGES: Record<string, [number, number]> = {
	top: [0, 22],
	"upper-centre": [15, 42],
	centre: [38, 63],
	"lower-centre": [58, 84],
	bottom: [78, 100],
}

// Approximate vertical midpoint of each zone as % of the page/container height.
// Used to position the location-cycle overlay button near the highlight band.
const ZONE_MIDPOINTS: Record<string, number> = {
	top: 11,
	"upper-centre": 29,
	centre: 51,
	"lower-centre": 71,
	bottom: 89,
}

function locationToHighlight(loc: FieldLocation): SourceViewerHighlight | null {
	const range = ZONE_RANGES[loc.zone]
	if (!range) return null
	return { page: loc.page, yStart: range[0], yEnd: range[1], active: true }
}

// ─── Shared sub-components ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function DetailsField({
	field,
	value,
	onChange,
	isExtracting,
	placeholder,
	compact,
	hideLabel,
}: {
	field: FieldMeta
	value: unknown
	onChange: (v: unknown) => void
	isExtracting: boolean
	placeholder?: string
	compact?: boolean
	hideLabel?: boolean
}) {
	const strVal = String(value ?? "")
	const [listText, setListText] = useState(() =>
		field.inputType === "list" && Array.isArray(value) ? value.join("\n") : "",
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on value identity
	useEffect(() => {
		if (field.inputType === "list") {
			setListText(Array.isArray(value) ? value.join("\n") : "")
		}
	}, [JSON.stringify(value)])

	const isLarge = field.inputType === "list" || field.inputType === "textarea"
	const dateInvalid =
		field.inputType === "date" && strVal !== "" && !DATE_RE.test(strVal)

	return (
		<div className="flex flex-col gap-1.5">
			{!hideLabel && (
				<Label className="text-xs font-medium">{field.label}</Label>
			)}
			{isExtracting ? (
				<Skeleton className={cn("w-full", isLarge ? "h-20" : "h-9")} />
			) : field.inputType === "list" ? (
				<Textarea
					className="resize-y"
					rows={compact ? 2 : 4}
					placeholder={placeholder ?? "One item per line"}
					value={listText}
					onChange={(e) => {
						setListText(e.target.value)
						onChange(e.target.value.split("\n").filter((l) => l.trim() !== ""))
					}}
				/>
			) : field.inputType === "textarea" ? (
				<Textarea
					className="resize-y"
					rows={compact ? 2 : 3}
					placeholder={placeholder}
					value={strVal}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : field.inputType === "date" ? (
				<>
					<Input
						placeholder={placeholder ?? "YYYY-MM-DD"}
						value={strVal}
						className={cn(dateInvalid && "border-destructive")}
						onChange={(e) => onChange(e.target.value)}
					/>
					{dateInvalid && (
						<p className="text-xs text-destructive">Use YYYY-MM-DD format</p>
					)}
				</>
			) : (
				<Input
					placeholder={placeholder}
					value={strVal}
					onChange={(e) => onChange(e.target.value)}
				/>
			)}
		</div>
	)
}

function DropZone({ onFile }: { onFile: (f: File) => void }) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)

	return (
		<button
			type="button"
			className={cn(
				"flex flex-col items-center justify-center w-full h-full gap-4 border-2 border-dashed rounded-lg transition-colors cursor-pointer text-center px-6",
				dragging
					? "border-primary bg-primary/5"
					: "border-muted-foreground/25 hover:border-muted-foreground/50",
			)}
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
			<Upload size={32} className="text-muted-foreground/40" />
			<div>
				<p className="text-sm font-medium">Drop PDF here</p>
				<p className="text-xs text-muted-foreground mt-1">or click to browse</p>
			</div>
		</button>
	)
}

// ─── New source dialog ────────────────────────────────────────────────────────

export function NewSourceDialog({
	open,
	onOpenChange,
	projectId,
	projectType,
	provider,
	apiKey,
	model,
	onCreated,
	onTempCreated,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	projectId: string
	projectType: ProjectType
	provider: string
	apiKey: string
	model: string
	onCreated: (asset: ApiAsset) => void
	onTempCreated?: (asset: ApiAsset) => void
}) {
	const allowedTypes = PROJECT_CONFIGS.find(
		(c) => c.id === projectType,
	)?.allowedAssetTypes
	const sourceTypes = ASSET_CONFIGS.filter(
		(c) => c.kind === "source" && allowedTypes?.includes(c.id),
	).map((c) => ({ id: c.id, label: c.typeLabel }))

	const [file, setFile] = useState<File | null>(null)
	const [type, setType] = useState<AssetType | "">("")
	const [details, setDetails] = useState<Record<string, unknown>>(() => ({}))
	const [locationMap, setLocationMap] = useState<
		Record<string, FieldLocation[]>
	>({})
	const [tempAsset, setTempAsset] = useState<ApiAsset | null>(null)
	const [step, setStep] = useState<Step>("upload")
	const [extractError, setExtractError] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)

	// Review state
	const [fieldIndex, setFieldIndex] = useState(0)
	const [locationIndex, setLocationIndex] = useState(0)
	const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set())

	const formFields = getFormFields(type)
	const canExtract = !!apiKey && !!type && isExtractable(type)

	useEffect(() => {
		if (!open) return
		setFile(null)
		setType("")
		setDetails({})
		setLocationMap({})
		setTempAsset(null)
		setStep("upload")
		setExtractError(null)
		setSaving(false)
		setFieldIndex(0)
		setLocationIndex(0)
		setDirtyFields(new Set())
	}, [open])

	useEffect(() => {
		setDetails((prev) => ({
			...emptyDetails(type),
			title: prev.title ?? "",
			date: prev.date ?? "",
			notes: prev.notes ?? "",
		}))
		setLocationMap({})
		setExtractError(null)
	}, [type])

	function handleFile(f: File) {
		setFile(f)
	}

	function handleClearFile() {
		setFile(null)
		setTempAsset(null)
		setExtractError(null)
	}

	async function handleExtractAndReview() {
		if (!file || !type) return
		setStep("processing")
		setExtractError(null)

		try {
			let targetId: string
			if (tempAsset) {
				targetId = tempAsset.id
			} else {
				const formData = new FormData()
				formData.append("file", file)
				formData.append("projectId", projectId)
				formData.append(
					"title",
					String(details.title ?? "").trim() ||
						file.name.replace(/\.pdf$/i, "") ||
						"Untitled",
				)
				formData.append("type", type)
				formData.append("kind", "source")
				formData.append("date", String(details.date ?? ""))
				formData.append("notes", String(details.notes ?? ""))
				const created = await api.assets.createSource(formData)
				setTempAsset(created)
				onTempCreated?.(created)
				targetId = created.id
			}

			const result = await api.extractpat.extract(
				targetId,
				provider,
				apiKey,
				model,
			)

			setLocationMap(extractLocationMap(result.extracted))
			setDetails(mergeExtracted(type, result.extracted))
			setFieldIndex(0)
			setLocationIndex(0)
			setDirtyFields(new Set())
			setStep("review")
		} catch (err) {
			setExtractError(err instanceof Error ? err.message : "Extraction failed.")
			setStep("upload")
		}
	}

	async function handleSave() {
		if (!file || !type) return
		const titleVal =
			String(details.title ?? "").trim() ||
			file.name.replace(/\.pdf$/i, "") ||
			"Untitled"
		const dateVal = String(details.date ?? "")
		const notesVal = String(details.notes ?? "")
		const detailsJson = JSON.stringify(details)

		setSaving(true)
		try {
			let saved: ApiAsset
			if (tempAsset) {
				saved = await api.assets.update(tempAsset.id, {
					title: titleVal,
					date: dateVal,
					notes: notesVal,
					type,
					details: detailsJson,
				})
			} else {
				const formData = new FormData()
				formData.append("file", file)
				formData.append("projectId", projectId)
				formData.append("title", titleVal)
				formData.append("type", type)
				formData.append("kind", "source")
				formData.append("date", dateVal)
				formData.append("notes", notesVal)
				formData.append("details", detailsJson)
				saved = await api.assets.createSource(formData)
			}
			onCreated(saved)
			onOpenChange(false)
		} finally {
			setSaving(false)
		}
	}

	// ── Review helpers ──────────────────────────────────────────────────────────

	const currentField = formFields[fieldIndex] ?? null
	const currentLocations: FieldLocation[] = currentField
		? (locationMap[currentField.key] ?? [])
		: []
	const currentLoc = currentLocations[locationIndex] ?? null
	const jumpPage = currentLoc?.page
	const highlights: SourceViewerHighlight[] = currentLoc
		? ([locationToHighlight(currentLoc)].filter(
				Boolean,
			) as SourceViewerHighlight[])
		: []
	const isLastField = fieldIndex === formFields.length - 1
	const currentValue = currentField ? details[currentField.key] : undefined
	const isFieldEmpty =
		currentValue === "" ||
		(Array.isArray(currentValue) && currentValue.length === 0)
	const currentFieldDirty = currentField
		? dirtyFields.has(currentField.key)
		: false

	function goToField(index: number) {
		setFieldIndex(index)
		setLocationIndex(0)
	}

	function goNext() {
		if (isLastField) {
			setStep("final")
		} else {
			goToField(fieldIndex + 1)
		}
	}

	function goBack() {
		if (fieldIndex === 0) {
			setStep("upload")
		} else {
			goToField(fieldIndex - 1)
		}
	}

	// ── Render ──────────────────────────────────────────────────────────────────

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="overflow-hidden p-0 md:max-w-[860px]"
				style={{ height: "min(90vh, 900px)" }}
			>
				{/* ── Upload / Processing ── */}
				{(step === "upload" || step === "processing") && (
					<div className="flex flex-col h-full overflow-hidden">
						{/* Header */}
						<DialogHeader>
							<DialogTitle>Add Source</DialogTitle>
							<DialogDescription>
								Upload a PDF and ExtractPat will extract the key fields for you
								to review and confirm.
							</DialogDescription>
						</DialogHeader>

						{/* PDF / drop zone — full width, fills available space */}
						<div className="relative flex-1 overflow-hidden">
							{file ? (
								<SourceViewer src={file} />
							) : (
								<div className="p-4 h-full">
									<DropZone onFile={handleFile} />
								</div>
							)}
							{step === "processing" && (
								<div className="absolute inset-0 flex items-center justify-center bg-background/60">
									<Loader2
										size={28}
										className="animate-spin text-muted-foreground"
									/>
								</div>
							)}
						</div>

						{/* Footer */}
						<div className="shrink-0 border-t px-4 py-3 flex items-center justify-between gap-2">
							<div className="flex flex-col gap-1.5 w-120">
								<div>
									<Label htmlFor="source-type" className="text-xs">
										Source type{" "}
										<span className="text-xs font-normal text-muted-foreground/50">
											• &nbsp;helps extraction, must be set, and cannot be
											changed afterwards.
										</span>
									</Label>
								</div>
								<Select
									value={type}
									onValueChange={(v) => setType(v as AssetType)}
									disabled={step === "processing"}
								>
									<SelectTrigger id="source-type" className="h-8 text-xs">
										<SelectValue placeholder="Select source type..." />
									</SelectTrigger>
									<SelectContent>
										{sourceTypes.map((t) => (
											<SelectItem key={t.id} value={t.id}>
												{t.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center gap-3">
								<div className="flex items-center gap-1.5 text-xs">
									{extractError ? (
										<span className="text-destructive">{extractError}</span>
									) : !file ? (
										<span className="text-muted-foreground flex items-center gap-1.5">
											<FileText size={13} />
											No file selected
										</span>
									) : (
										<button
											type="button"
											onClick={handleClearFile}
											className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
										>
											<X size={11} />
											{file.name}
										</button>
									)}
								</div>

								{canExtract ? (
									<Button
										onClick={handleExtractAndReview}
										disabled={!file || !type || step === "processing"}
									>
										{step === "processing" ? (
											<Loader2 size={12} className="animate-spin" />
										) : (
											<>
												<Clover size={12} /> Extract & Review
											</>
										)}
									</Button>
								) : (
									<Button
										onClick={handleSave}
										disabled={!file || !type || saving}
									>
										{saving ? (
											<Loader2 size={12} className="animate-spin" />
										) : (
											"Save"
										)}
									</Button>
								)}
							</div>
						</div>
					</div>
				)}

				{/* ── Field-by-field review ── */}
				{step === "review" && file && currentField && (
					<div className="flex flex-col h-full overflow-hidden">
						{/* Header */}
						<DialogHeader>
							<DialogTitle>Review Extraction</DialogTitle>
							<DialogDescription>
								Verify each field against the highlighted section. Edit if
								needed, then click Next — or Skip to review for a full summary.
							</DialogDescription>
						</DialogHeader>

						{/* PDF — takes remaining space; overlay button for multi-location cycling */}
						<div className="flex-1 overflow-hidden min-h-0 relative">
							<SourceViewer
								src={file}
								jumpToPage={jumpPage}
								highlights={highlights}
							/>
							{currentLocations.length > 1 && currentLoc && (
								<button
									type="button"
									className="absolute right-3 z-10 flex items-center gap-1 rounded-md border-2 border-amber-400 bg-amber-400/25 px-2.5 py-1 text-sm font-bold text-amber-700 shadow-md hover:bg-amber-400/45 dark:text-amber-300"
									style={{
										top: `${ZONE_MIDPOINTS[currentLoc.zone] ?? 50}%`,
									}}
									onClick={() =>
										setLocationIndex((i) => (i + 1) % currentLocations.length)
									}
								>
									{locationIndex + 1}/{currentLocations.length}
									<ChevronRight size={14} />
								</button>
							)}
						</div>
						<div className="shrink-0 border-t px-4 pt-4 pb-3 pr-12">
							<Label className="text-xs font-medium mb-1.5 block">
								{currentField.label}
							</Label>
							<DetailsField
								field={currentField}
								value={
									details[currentField.key] ??
									(currentField.inputType === "list" ? [] : "")
								}
								onChange={(v) => {
									setDetails((prev) => ({
										...prev,
										[currentField.key]: v,
									}))
									setDirtyFields((prev) => new Set([...prev, currentField.key]))
								}}
								isExtracting={false}
								compact
								hideLabel
								placeholder={
									isFieldEmpty
										? "Nothing extracted — enter manually if known"
										: undefined
								}
							/>
						</div>
						<div className="shrink-0 border-t px-4 py-2 flex items-center gap-2">
							<Button variant="outline" size="sm" onClick={goBack}>
								<ChevronLeft size={12} /> Back
							</Button>
							<span className="text-xs text-muted-foreground tabular-nums">
								{fieldIndex + 1} / {formFields.length}
							</span>
							<Button
								variant="ghost"
								size="sm"
								className="ml-auto"
								onClick={() => setStep("final")}
							>
								Skip to review
							</Button>
							<Button size="sm" onClick={goNext}>
								{currentFieldDirty && <Check size={12} />}
								{isLastField ? "Finish" : "Next"}
								{!isLastField && <ChevronRight size={12} />}
							</Button>
						</div>
					</div>
				)}

				{/* ── Final review ── */}
				{step === "final" && (
					<div className="flex flex-col h-full overflow-hidden">
						<DialogHeader>
							<DialogTitle>Review & Save</DialogTitle>
							<DialogDescription>
								Check all fields before saving.
							</DialogDescription>
						</DialogHeader>

						{/* Scrollable form — min-h-0 ensures it shrinks within the flex column */}
						<div className="flex-1 overflow-y-auto min-h-0">
							<div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto">
								{formFields.map((field) => (
									<DetailsField
										key={field.key}
										field={field}
										value={
											details[field.key] ??
											(field.inputType === "list" ? [] : "")
										}
										onChange={(v) =>
											setDetails((prev) => ({ ...prev, [field.key]: v }))
										}
										isExtracting={false}
									/>
								))}
							</div>
						</div>

						{/* Fixed footer — always visible */}
						<div className="shrink-0 border-t px-4 py-3 flex items-center justify-between gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									goToField(formFields.length - 1)
									setStep("review")
								}}
							>
								<ChevronLeft size={12} /> Back
							</Button>
							<Button onClick={handleSave} disabled={saving}>
								{saving ? (
									<Loader2 size={12} className="animate-spin" />
								) : (
									"Save"
								)}
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
