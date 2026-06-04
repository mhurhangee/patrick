import type {
	ApiAsset,
	ExtractionRecord,
	FieldLocation,
	TaskType,
} from "@patrickos/shared"
import {
	ASSET_CONFIGS,
	allowedAssetTypesFor,
	emptyDetails,
	extractLocationMap,
	getFormFields,
	isExtractable,
	mergeExtracted,
} from "@patrickos/shared"
import { ChevronDown, Clover, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
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
import { api } from "@/lib/api"
import { DetailsField } from "./details-field"

const SOURCE_TYPES = ASSET_CONFIGS.filter(
	(c) => c.kind === "source" && isExtractable(c.id),
)

function typeLabel(assetType: string | null) {
	return ASSET_CONFIGS.find((c) => c.id === assetType)?.typeLabel ?? ""
}

type ExtractState = "idle" | "extracting" | "error"
type SaveStatus = "idle" | "saving" | "saved"

// ExtractPat state for a single source — owned by the SourcePane so the controls
// (toolbar) and the body share state and survive a Source ⇄ Extraction view flip.
export function useExtraction({
	asset,
	provider,
	apiKey,
	model,
	onExtracted,
	taskType,
}: {
	asset: ApiAsset
	provider: string
	apiKey: string
	model: string
	/** Notify the workspace that an extraction record now exists (refresh badges). */
	onExtracted: () => void
	/** Current task type — narrows the source types offered to the relevant ones. */
	taskType?: TaskType
}) {
	const [selectedType, setSelectedType] = useState("auto")
	const [resolvedType, setResolvedType] = useState<string | null>(null)
	const [details, setDetails] = useState<Record<string, unknown>>({})
	const [locations, setLocations] = useState<Record<string, FieldLocation[]>>(
		{},
	)
	const [extractedAt, setExtractedAt] = useState("")
	const [loading, setLoading] = useState(true)
	const [extractState, setExtractState] = useState<ExtractState>("idle")
	const [extractError, setExtractError] = useState<string | null>(null)
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
	const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
	const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
	// Snapshot of what the pending debounced auto-save should write — kept in a ref
	// so the delayed flush reads the latest edit, not a stale render closure.
	const pendingSave = useRef<ExtractionRecord | null>(null)

	useEffect(
		() => () => {
			if (saveTimer.current) clearTimeout(saveTimer.current)
			if (idleTimer.current) clearTimeout(idleTimer.current)
		},
		[],
	)

	// Load the existing extraction record (if any) when the source changes.
	useEffect(() => {
		let cancelled = false
		setLoading(true)
		api.extractions.get(asset.taskId, asset.filename).then((rec) => {
			if (cancelled) return
			if (rec) {
				setSelectedType(rec.assetType)
				setResolvedType(rec.assetType)
				setDetails(rec.details)
				setLocations(rec.locations ?? {})
				setExtractedAt(rec.extractedAt)
			} else {
				setSelectedType("auto")
				setResolvedType(null)
				setDetails({})
				setLocations({})
				setExtractedAt("")
			}
			setExtractState("idle")
			setExtractError(null)
			setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [asset.taskId, asset.filename])

	const effectiveType = selectedType !== "auto" ? selectedType : resolvedType
	const fields = effectiveType ? getFormFields(effectiveType) : []
	const isExtracting = extractState === "extracting"

	// Narrow the offered source types to the task's relevant ones (keep the
	// currently-resolved type visible even if it falls outside the task scope).
	const allowed = allowedAssetTypesFor(taskType)
	const typeOptions = SOURCE_TYPES.filter(
		(t) => !allowed || allowed.includes(t.id) || t.id === resolvedType,
	)

	function changeType(t: string) {
		setSelectedType(t)
		if (t !== "auto") {
			setResolvedType(t)
			setDetails((prev) => ({ ...emptyDetails(t), ...prev }))
		}
	}

	async function run() {
		setExtractState("extracting")
		setExtractError(null)
		// Track the resolved type locally so partials can be unwrapped as they stream.
		let activeType = selectedType !== "auto" ? selectedType : null
		try {
			await api.extractpatStream.run(
				asset.path,
				selectedType,
				provider,
				apiKey,
				model,
				{
					onMeta: (t) => {
						activeType = t
						setResolvedType(t)
						setSelectedType(t)
					},
					onPartial: (obj) => {
						if (!activeType) return
						setDetails(mergeExtracted(activeType, obj))
						setLocations(extractLocationMap(obj))
					},
					onDone: (rec) => {
						setResolvedType(rec.assetType)
						setSelectedType(rec.assetType)
						setDetails(rec.details)
						setLocations(rec.locations ?? {})
						setExtractedAt(rec.extractedAt)
						setExtractState("idle")
						onExtracted()
					},
				},
			)
		} catch (err) {
			setExtractError(err instanceof Error ? err.message : "Extraction failed.")
			setExtractState("error")
		}
	}

	async function clearExtraction() {
		if (saveTimer.current) clearTimeout(saveTimer.current)
		pendingSave.current = null
		await api.extractions.delete(asset.taskId, asset.filename)
		setSelectedType("auto")
		setResolvedType(null)
		setDetails({})
		setLocations({})
		setExtractedAt("")
		setExtractState("idle")
		setExtractError(null)
		setSaveStatus("idle")
		onExtracted()
	}

	// The streamed run already persists server-side (writeExtraction on "done"), so
	// we only auto-save *manual* field edits — debounced, like the artifact editor.
	async function flushSave() {
		const record = pendingSave.current
		if (!record) return
		try {
			await api.extractions.save(asset.taskId, record)
			setSaveStatus("saved")
			onExtracted()
			if (idleTimer.current) clearTimeout(idleTimer.current)
			idleTimer.current = setTimeout(() => setSaveStatus("idle"), 2000)
		} catch {
			setSaveStatus("idle")
		}
	}

	function editField(key: string, val: unknown) {
		if (!effectiveType) return
		const next = { ...details, [key]: val }
		setDetails(next)
		pendingSave.current = {
			filename: asset.filename,
			assetType: effectiveType,
			details: next,
			locations,
			extractedAt: extractedAt || new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}
		setSaveStatus("saving")
		if (saveTimer.current) clearTimeout(saveTimer.current)
		saveTimer.current = setTimeout(flushSave, 600)
	}

	return {
		selectedType,
		changeType,
		typeOptions,
		details,
		editField,
		locations,
		effectiveType,
		fields,
		extractedAt,
		loading,
		isExtracting,
		extractError,
		saveStatus,
		run,
		clearExtraction,
	}
}

export type Extraction = ReturnType<typeof useExtraction>

// ExtractPat menu — a single "ExtractPat" button whose popover holds the type
// picker, Run / Re-run, and Clear. Lives on the shared control row next to the
// Source ⇄ Extraction toggle. `onRun` lets the SourcePane flip to the Extraction
// view when extraction starts.
export function ExtractionMenu({
	extraction,
	apiKey,
	excludedFromAgent,
	onRun,
}: {
	extraction: Extraction
	apiKey: string
	excludedFromAgent: boolean
	onRun: () => void
}) {
	const {
		selectedType,
		changeType,
		typeOptions,
		isExtracting,
		extractedAt,
		clearExtraction,
	} = extraction
	const [open, setOpen] = useState(false)

	const runBlocked = isExtracting || !apiKey || excludedFromAgent
	const runTitle = excludedFromAgent
		? "This source is excluded from AgentPat — include it to extract"
		: !apiKey
			? "Connect an AI provider in settings"
			: undefined

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="default" size="sm">
					{isExtracting ? <Loader2 size={12} className="animate-spin" /> : null}
					{isExtracting ? "Extracting…" : "ExtractPat"}
					<ChevronDown size={12} className="opacity-70" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-64 flex-col gap-3">
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						Document type
					</span>
					<Select value={selectedType} onValueChange={changeType}>
						<SelectTrigger className="h-8 text-xs w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="auto">Auto-detect</SelectItem>
							{typeOptions.map((t) => (
								<SelectItem key={t.id} value={t.id}>
									{t.typeLabel}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex justify-between">
					{extractedAt && (
						<Button
							variant="destructive"
							size="sm"
							onClick={() => {
								setOpen(false)
								clearExtraction()
							}}
							disabled={isExtracting}
						>
							Clear
						</Button>
					)}
					<Button
						variant="default"
						size="sm"
						className="ml-auto"
						onClick={() => {
							setOpen(false)
							onRun()
						}}
						disabled={runBlocked}
						title={runTitle}
					>
						{isExtracting ? (
							<Loader2 size={12} className="animate-spin" />
						) : null}
						{extractedAt ? "Reextract" : "Extract data"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	)
}

// The extracted-data form — the body shown when the Extraction view is active.
export function ExtractionBody({
	asset,
	extraction,
	excludedFromAgent,
	onLocate,
}: {
	asset: ApiAsset
	extraction: Extraction
	/** Source is excluded from AgentPat — surface why ExtractPat is blocked. */
	excludedFromAgent: boolean
	onLocate: (locations: FieldLocation[]) => void
}) {
	const {
		loading,
		extractError,
		isExtracting,
		effectiveType,
		fields,
		details,
		editField,
		locations,
		saveStatus,
	} = extraction

	return (
		<div className="flex-1 overflow-y-auto">
			{excludedFromAgent && (
				<p className="m-4 rounded-md bg-amber-100/50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-500">
					This source is excluded from AgentPat. Include it (eye toggle in the
					document toolbar) to run ExtractPat.
				</p>
			)}
			{loading ? (
				<div className="p-4 text-xs text-muted-foreground">Loading…</div>
			) : extractError ? (
				<p className="m-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{extractError}
				</p>
			) : null}

			{isExtracting && !effectiveType ? (
				<div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
					<Loader2
						size={20}
						className="animate-spin text-muted-foreground/50"
					/>
					<p className="text-sm text-muted-foreground">Extracting…</p>
					<p className="max-w-xs text-xs text-muted-foreground/70">
						Auto-detecting the document type, then extracting structured data.
					</p>
				</div>
			) : !loading && !effectiveType ? (
				<div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
					<Clover size={24} className="text-muted-foreground/30" />
					<p className="text-sm text-muted-foreground">No extraction yet</p>
					<p className="max-w-xs text-xs text-muted-foreground/70">
						Pick a document type, or leave it on Auto-detect and run ExtractPat
						to classify and pull structured data from this source.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-4 p-4">
					<div className="flex items-baseline gap-2">
						<h1 className="text-lg font-semibold">
							Extracted Data from {asset.title}
						</h1>
						{effectiveType && (
							<span className="text-xs text-muted-foreground">
								· {typeLabel(effectiveType)}
							</span>
						)}
						{saveStatus !== "idle" && (
							<span className="ml-auto text-xs text-muted-foreground">
								{saveStatus === "saving" ? "Saving…" : "Saved"}
							</span>
						)}
					</div>
					{fields.map((field) => {
						const v = details[field.key]
						const hasValue = Array.isArray(v)
							? v.length > 0
							: !!(v && String(v).length)
						return (
							<DetailsField
								key={field.key}
								field={field}
								value={v ?? (field.inputType === "list" ? [] : "")}
								onChange={(val) => editField(field.key, val)}
								// While extracting, show a skeleton only until this field streams in.
								isExtracting={isExtracting && !hasValue}
								hasLocation={!!locations[field.key]?.length}
								onLocate={() => {
									const locs = locations[field.key]
									if (locs?.length) onLocate(locs)
								}}
							/>
						)
					})}
				</div>
			)}
		</div>
	)
}
