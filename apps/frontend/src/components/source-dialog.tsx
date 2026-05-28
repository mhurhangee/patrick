import {
	ASSET_CONFIGS,
	type AssetType,
	emptyDetails,
	type FieldDef,
	mergeExtracted,
} from "@patrickos/db"
import {
	Check,
	Clover,
	FileText,
	Loader2,
	Trash2,
	Upload,
	X,
} from "lucide-react"
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { type ApiAsset, api, BASE_URL } from "@/lib/api"
import { cn } from "@/lib/utils"

const SOURCE_TYPES = ASSET_CONFIGS.filter((c) => c.kind === "source").map(
	(c) => ({ id: c.id, label: c.typeLabel }),
)

// ─── Save button hook ─────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved"

function useSaveButton() {
	const [status, setStatus] = React.useState<SaveStatus>("idle")
	const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	React.useEffect(() => {
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

// ─── Details field ────────────────────────────────────────────────────────────

function DetailsField({
	field,
	value,
	onChange,
	isExtracting,
}: {
	field: FieldDef
	value: unknown
	onChange: (v: unknown) => void
	isExtracting: boolean
}) {
	const strVal = String(value ?? "")

	const [rawJson, setRawJson] = React.useState(
		field.complex ? JSON.stringify(value, null, 2) : "",
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on value identity
	React.useEffect(() => {
		if (field.complex) setRawJson(JSON.stringify(value, null, 2))
	}, [JSON.stringify(value)])

	const skeletonH = field.complex || field.multiline ? "h-20" : "h-9"

	return (
		<div className="flex flex-col gap-1.5">
			<Label className="text-xs font-medium">{field.label}</Label>
			{isExtracting ? (
				<Skeleton className={cn("w-full", skeletonH)} />
			) : field.complex ? (
				<Textarea
					className="font-mono text-xs resize-y"
					rows={6}
					value={rawJson}
					onChange={(e) => {
						setRawJson(e.target.value)
						try {
							onChange(JSON.parse(e.target.value))
						} catch {
							// keep stale parsed value while JSON is mid-edit
						}
					}}
				/>
			) : field.multiline ? (
				<Textarea
					className="resize-y"
					rows={3}
					value={strVal}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : field.dateField ? (
				<Input
					type="date"
					value={strVal}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : (
				<Input value={strVal} onChange={(e) => onChange(e.target.value)} />
			)}
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

// ─── Main dialog ──────────────────────────────────────────────────────────────

type ExtractState = "idle" | "extracting" | "done" | "error"

export function SourceDialog({
	asset,
	open,
	onOpenChange,
	projectId,
	provider,
	apiKey,
	model,
	onSaved,
	onDeleted,
}: {
	asset?: ApiAsset
	open: boolean
	onOpenChange: (v: boolean) => void
	projectId: string
	provider: string
	apiKey: string
	model: string
	onSaved: (asset: ApiAsset) => void
	onDeleted?: (id: string) => void
}) {
	const isEdit = !!asset

	// Form state
	const [newFile, setNewFile] = React.useState<File | null>(null)
	const [type, setType] = React.useState<AssetType>("office-action")
	const [details, setDetails] = React.useState<Record<string, unknown>>(() =>
		emptyDetails("office-action"),
	)

	// Edit mode: dirty tracking
	const [savedType, setSavedType] = React.useState<AssetType>("office-action")
	const [savedDetails, setSavedDetails] = React.useState<
		Record<string, unknown>
	>({})

	// Add mode: temp asset created during extract so we can update instead of re-upload
	const [tempAsset, setTempAsset] = React.useState<ApiAsset | null>(null)

	// Status
	const [saving, setSaving] = React.useState(false)
	const [extractState, setExtractState] = React.useState<ExtractState>("idle")
	const [extractError, setExtractError] = React.useState<string | null>(null)
	const { status: saveStatus, wrap: wrapSave } = useSaveButton()

	// Sync form state when dialog opens or asset switches
	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on open/asset identity
	React.useEffect(() => {
		if (!open) return
		if (asset) {
			const t = asset.type as AssetType
			setType(t)
			setSavedType(t)
			const merged = {
				...emptyDetails(t),
				...(asset.details
					? (JSON.parse(asset.details) as Record<string, unknown>)
					: {}),
			}
			setDetails(merged)
			setSavedDetails(merged)
		} else {
			setType("office-action")
			setDetails(emptyDetails("office-action"))
			setSavedType("office-action")
			setSavedDetails({})
		}
		setNewFile(null)
		setTempAsset(null)
		setSaving(false)
		setExtractState("idle")
		setExtractError(null)
	}, [open, asset?.id])

	// In add mode: when type changes, preserve title/date/notes, reset type-specific fields
	React.useEffect(() => {
		if (isEdit) return
		setDetails((prev) => ({
			...emptyDetails(type),
			title: prev.title ?? "",
			date: prev.date ?? "",
			notes: prev.notes ?? "",
		}))
		setExtractState("idle")
		setExtractError(null)
	}, [type, isEdit])

	const isDirty =
		type !== savedType ||
		JSON.stringify(details) !== JSON.stringify(savedDetails)

	const canExtract = !!apiKey
	const isExtracting = extractState === "extracting"
	const schema = ASSET_CONFIGS.find((c) => c.id === type)?.fields ?? []

	function handleFile(f: File) {
		setNewFile(f)
		if (!String(details.title ?? "").trim()) {
			setDetails((prev) => ({ ...prev, title: f.name.replace(/\.pdf$/i, "") }))
		}
	}

	function handleClearFile() {
		setNewFile(null)
		if (!isEdit) setTempAsset(null)
		setExtractState("idle")
		setExtractError(null)
	}

	async function handleExtract() {
		if (!isEdit && !newFile) return
		setExtractState("extracting")
		setExtractError(null)
		try {
			let targetId: string
			if (asset) {
				// Edit mode: re-extract from stored file
				targetId = asset.id
			} else if (tempAsset) {
				// Add mode: already uploaded during a previous extract
				targetId = tempAsset.id
			} else {
				// Add mode: upload first to get an asset ID
				const formData = new FormData()
				if (newFile) formData.append("file", newFile)
				formData.append("projectId", projectId)
				formData.append(
					"title",
					String(details.title ?? "").trim() ||
					newFile?.name.replace(/\.pdf$/i, "") ||
					"Untitled",
				)
				formData.append("type", type)
				formData.append("kind", "source")
				formData.append("date", String(details.date ?? ""))
				formData.append("notes", String(details.notes ?? ""))
				const created = await api.assets.createSource(formData)
				setTempAsset(created)
				targetId = created.id
			}
			const result = await api.extractpat.extract(
				targetId,
				provider,
				apiKey,
				model,
			)
			setDetails(mergeExtracted(type, result.extracted))
			setExtractState("done")
		} catch (err) {
			setExtractError(err instanceof Error ? err.message : "Extraction failed.")
			setExtractState("error")
		}
	}

	async function handleSave() {
		const titleVal =
			String(details.title ?? "").trim() ||
			newFile?.name.replace(/\.pdf$/i, "") ||
			"Untitled"
		const dateVal = String(details.date ?? "")
		const notesVal = String(details.notes ?? "")
		const detailsJson = JSON.stringify(details)

		if (asset) {
			// Edit mode: update in place, show save status
			await wrapSave(async () => {
				const updated = await api.assets.update(asset.id, {
					title: titleVal,
					date: dateVal,
					notes: notesVal,
					type,
					details: detailsJson,
				})
				setSavedType(updated.type as AssetType)
				setSavedDetails(details)
				onSaved(updated)
			})
		} else {
			// Add mode: create and close
			setSaving(true)
			try {
				let saved: ApiAsset
				if (tempAsset) {
					// Already uploaded during extract — just update fields
					saved = await api.assets.update(tempAsset.id, {
						title: titleVal,
						date: dateVal,
						notes: notesVal,
						type,
						details: detailsJson,
					})
				} else {
					if (!newFile) return
					const formData = new FormData()
					formData.append("file", newFile)
					formData.append("projectId", projectId)
					formData.append("title", titleVal)
					formData.append("type", type)
					formData.append("kind", "source")
					formData.append("date", dateVal)
					formData.append("notes", notesVal)
					formData.append("details", detailsJson)
					saved = await api.assets.createSource(formData)
				}
				onSaved(saved)
				onOpenChange(false)
			} finally {
				setSaving(false)
			}
		}
	}

	// ── Render ────────────────────────────────────────────────────────────────

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
		<Button size="sm" onClick={handleSave} disabled={!newFile || saving}>
			{saving ? (
				<>
					<Loader2 size={12} className="animate-spin" />
					Saving…
				</>
			) : (
				"Save"
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
						Delete source
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete source?</AlertDialogTitle>
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
			<DialogContent className="overflow-hidden p-0 md:max-w-[1100px]">
				<DialogTitle className="sr-only">
					{isEdit ? "Edit Source" : "Add Source"}
				</DialogTitle>
				<DialogDescription className="sr-only">
					{isEdit
						? "Edit source document details or re-extract."
						: "Upload a PDF source document."}
				</DialogDescription>

				<div className="flex" style={{ height: "min(840px, 85vh)" }}>
					{/* Left — PDF */}
					<div className="w-[45%] border-r bg-muted/30 p-3">
						{isEdit && !newFile ? (
							<iframe
								src={`${BASE_URL}/assets/${asset.id}/file`}
								title="PDF preview"
								className="w-full h-full border-0 rounded"
							/>
						) : (
							<PdfDropZone file={newFile} onFile={handleFile} />
						)}
					</div>

					{/* Right — form */}
					<div className="flex flex-col flex-1">
						{/* Header */}
						<div className="h-12 shrink-0 flex items-center border-b px-4">
							<span className="text-sm font-medium">
								{isEdit ? (asset?.title ?? "Edit Source") : "Add Source"}
							</span>
						</div>

						{/* Body — scrollable */}
						<div className="flex-1 overflow-y-auto">
							<div className="flex flex-col gap-4 p-4">
								{extractError && (
									<p className="text-xs text-destructive rounded-md bg-destructive/10 px-3 py-2">
										{extractError}
									</p>
								)}

								{/* Type selector */}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="source-type" className="text-xs font-medium">
										Type
									</Label>
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

								{/* Schema-driven fields */}
								{schema.map((field) => (
									<DetailsField
										key={field.key}
										field={field}
										value={details[field.key] ?? (field.complex ? [] : "")}
										onChange={(v) =>
											setDetails((prev) => ({ ...prev, [field.key]: v }))
										}
										isExtracting={isExtracting}
									/>
								))}
							</div>
						</div>

						{/* Footer — always visible */}
						<div className="h-14 shrink-0 border-t px-4 flex items-center gap-2">
							{/* Left */}
							<div className="flex-1">
								{isEdit ? (
									deleteButton
								) : !newFile ? (
									<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
										<FileText size={13} />
										No file selected
									</div>
								) : (
									<button
										type="button"
										onClick={handleClearFile}
										className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
									>
										<X size={11} />
										{newFile.name}
									</button>
								)}
							</div>

							{/* Extract */}
							{canExtract && (
								<Button
									size="sm"
									variant="outline"
									onClick={handleExtract}
									disabled={(!isEdit && !newFile) || isExtracting || saving}
								>
									{isExtracting ? (
										<>
											<Loader2 size={12} className="animate-spin" />
											Extracting…
										</>
									) : (
										<>
											<Clover size={12} />
											ExtractPat
										</>
									)}
								</Button>
							)}

							{/* Save */}
							{saveButton}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
