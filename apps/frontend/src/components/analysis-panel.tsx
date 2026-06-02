import type { AnalysisRecord, ApiAsset, FieldLocation } from "@patrickos/shared"
import {
	ASSET_CONFIGS,
	emptyDetails,
	extractLocationMap,
	getFormFields,
	isExtractable,
	mergeExtracted,
} from "@patrickos/shared"
import { Clover, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
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

type ExtractState = "idle" | "extracting" | "error"
type SaveStatus = "idle" | "saving" | "saved"

export function AnalysisPanel({
	asset,
	provider,
	apiKey,
	model,
	onLocate,
	onAnalysed,
	excludedFromAgent,
}: {
	asset: ApiAsset
	provider: string
	apiKey: string
	model: string
	onLocate: (locations: FieldLocation[]) => void
	/** Notify the workspace that an analysis record now exists (refresh badges). */
	onAnalysed: () => void
	/** Source is excluded from AgentPat — block running ExtractPat. */
	excludedFromAgent: boolean
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

	useEffect(
		() => () => {
			if (saveTimer.current) clearTimeout(saveTimer.current)
		},
		[],
	)

	// Load the existing analysis record (if any) when the source changes.
	useEffect(() => {
		let cancelled = false
		setLoading(true)
		api.analysis.get(asset.taskId, asset.filename).then((rec) => {
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
						onAnalysed()
					},
				},
			)
		} catch (err) {
			setExtractError(err instanceof Error ? err.message : "Extraction failed.")
			setExtractState("error")
		}
	}

	async function clearAnalysis() {
		await api.analysis.delete(asset.taskId, asset.filename)
		setSelectedType("auto")
		setResolvedType(null)
		setDetails({})
		setLocations({})
		setExtractedAt("")
		setExtractState("idle")
		setExtractError(null)
		onAnalysed()
	}

	async function save() {
		if (!effectiveType) return
		setSaveStatus("saving")
		try {
			const record: AnalysisRecord = {
				filename: asset.filename,
				assetType: effectiveType,
				details,
				locations,
				extractedAt: extractedAt || new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}
			await api.analysis.save(asset.taskId, record)
			setSaveStatus("saved")
			onAnalysed()
			saveTimer.current = setTimeout(() => setSaveStatus("idle"), 2000)
		} catch {
			setSaveStatus("idle")
		}
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Toolbar */}
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
				<Select value={selectedType} onValueChange={changeType}>
					<SelectTrigger className="h-8 w-56 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="auto">Auto-detect</SelectItem>
						{SOURCE_TYPES.map((t) => (
							<SelectItem key={t.id} value={t.id}>
								{t.typeLabel}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Button
					variant="default"
					size="sm"
					onClick={run}
					disabled={isExtracting || !apiKey || excludedFromAgent}
					title={
						excludedFromAgent
							? "This source is excluded from AgentPat — include it to analyse"
							: !apiKey
								? "Connect an AI provider in settings"
								: undefined
					}
				>
					{isExtracting ? (
						<Loader2 size={12} className="animate-spin" />
					) : (
						<Clover size={12} />
					)}
					{extractedAt ? "Re-run" : "Run ExtractPat"}
				</Button>

				{extractedAt && (
					<Button
						variant="ghost"
						size="sm"
						className="ml-auto text-muted-foreground"
						onClick={clearAnalysis}
						disabled={isExtracting}
						title="Delete this analysis"
					>
						Clear
					</Button>
				)}

				<Button
					variant="ghost"
					size="sm"
					className={extractedAt ? undefined : "ml-auto"}
					onClick={save}
					disabled={!effectiveType || saveStatus === "saving"}
				>
					{saveStatus === "saving"
						? "Saving…"
						: saveStatus === "saved"
							? "Saved"
							: "Save"}
				</Button>
			</div>

			{/* Body */}
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
						<p className="text-sm text-muted-foreground">Analysing…</p>
						<p className="max-w-xs text-xs text-muted-foreground/70">
							Auto-detecting the document type, then extracting structured data.
						</p>
					</div>
				) : !loading && !effectiveType ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
						<Clover size={24} className="text-muted-foreground/30" />
						<p className="text-sm text-muted-foreground">No analysis yet</p>
						<p className="max-w-xs text-xs text-muted-foreground/70">
							Pick a document type, or leave it on Auto-detect and run
							ExtractPat to classify and pull structured data from this source.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-4 p-4">
						<h1 className="text-lg font-semibold">
							Extracted Data from {asset.title}
						</h1>
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
									onChange={(val) =>
										setDetails((prev) => ({ ...prev, [field.key]: val }))
									}
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
		</div>
	)
}
