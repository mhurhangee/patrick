import type { ApiAsset } from "@patrickos/db"
import {
	ASSET_CONFIGS,
	type AssetType,
	emptyDetails,
	type FieldMeta,
	getFormFields,
	isExtractable,
	mergeExtracted,
	PROJECT_CONFIGS,
	type ProjectType,
} from "@patrickos/db"
import { Clover, FileText, Loader2, Upload, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
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

// ─── Shared sub-components ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function DetailsField({
	field,
	value,
	onChange,
	isExtracting,
}: {
	field: FieldMeta
	value: unknown
	onChange: (v: unknown) => void
	isExtracting: boolean
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
			<Label className="text-xs font-medium">{field.label}</Label>
			{isExtracting ? (
				<Skeleton className={cn("w-full", isLarge ? "h-20" : "h-9")} />
			) : field.inputType === "list" ? (
				<Textarea
					className="resize-y"
					rows={4}
					placeholder="One item per line"
					value={listText}
					onChange={(e) => {
						setListText(e.target.value)
						onChange(e.target.value.split("\n").filter((l) => l.trim() !== ""))
					}}
				/>
			) : field.inputType === "textarea" ? (
				<Textarea
					className="resize-y"
					rows={3}
					value={strVal}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : field.inputType === "date" ? (
				<>
					<Input
						placeholder="YYYY-MM-DD"
						value={strVal}
						className={cn(dateInvalid && "border-destructive")}
						onChange={(e) => onChange(e.target.value)}
					/>
					{dateInvalid && (
						<p className="text-xs text-destructive">Use YYYY-MM-DD format</p>
					)}
				</>
			) : (
				<Input value={strVal} onChange={(e) => onChange(e.target.value)} />
			)}
		</div>
	)
}

function PdfDropZone({
	file,
	onFile,
}: {
	file: File | null
	onFile: (f: File) => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)
	const objectUrl = useMemo(
		() => (file ? URL.createObjectURL(file) : null),
		[file],
	)

	useEffect(
		() => () => {
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		},
		[objectUrl],
	)

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

// ─── New source dialog ────────────────────────────────────────────────────────

type ExtractState = "idle" | "extracting" | "done" | "error"

export function NewSourceDialog({
	open,
	onOpenChange,
	projectId,
	projectType,
	provider,
	apiKey,
	model,
	onCreated,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	projectId: string
	projectType: ProjectType
	provider: string
	apiKey: string
	model: string
	onCreated: (asset: ApiAsset) => void
}) {
	const allowedTypes = PROJECT_CONFIGS.find(
		(c) => c.id === projectType,
	)?.allowedAssetTypes
	const sourceTypes = ASSET_CONFIGS.filter(
		(c) => c.kind === "source" && allowedTypes?.includes(c.id),
	).map((c) => ({ id: c.id, label: c.typeLabel }))
	const defaultSourceType = sourceTypes[0]?.id ?? "us-office-action"

	const [file, setFile] = useState<File | null>(null)
	const [type, setType] = useState<AssetType>(defaultSourceType)
	const [details, setDetails] = useState<Record<string, unknown>>(() =>
		emptyDetails(defaultSourceType),
	)
	const [tempAsset, setTempAsset] = useState<ApiAsset | null>(null)
	const [saving, setSaving] = useState(false)
	const [extractState, setExtractState] = useState<ExtractState>("idle")
	const [extractError, setExtractError] = useState<string | null>(null)

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on open only
	useEffect(() => {
		if (!open) return
		setFile(null)
		setType(defaultSourceType)
		setDetails(emptyDetails(defaultSourceType))
		setTempAsset(null)
		setSaving(false)
		setExtractState("idle")
		setExtractError(null)
	}, [open])

	useEffect(() => {
		setDetails((prev) => ({
			...emptyDetails(type),
			title: prev.title ?? "",
			date: prev.date ?? "",
			notes: prev.notes ?? "",
		}))
		setExtractState("idle")
		setExtractError(null)
	}, [type])

	const canExtract = !!apiKey && isExtractable(type)
	const isExtracting = extractState === "extracting"
	const formFields = getFormFields(type)

	function handleFile(f: File) {
		setFile(f)
		if (!String(details.title ?? "").trim()) {
			setDetails((prev) => ({ ...prev, title: f.name.replace(/\.pdf$/i, "") }))
		}
	}

	function handleClearFile() {
		setFile(null)
		setTempAsset(null)
		setExtractState("idle")
		setExtractError(null)
	}

	async function handleExtract() {
		if (!file) return
		setExtractState("extracting")
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
		if (!file) return
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 md:max-w-[1100px]">
				<DialogTitle className="sr-only">Add Source</DialogTitle>
				<DialogDescription className="sr-only">
					Upload a PDF source document.
				</DialogDescription>

				<div className="flex" style={{ height: "min(840px, 85vh)" }}>
					{/* Left — PDF */}
					<div className="w-[45%] border-r bg-muted/30 p-3">
						<PdfDropZone file={file} onFile={handleFile} />
					</div>

					{/* Right — form */}
					<div className="flex flex-col flex-1 overflow-hidden">
						<DialogHeader className="shrink-0 border-b px-4 py-3">
							<DialogTitle>Add Source</DialogTitle>
							<DialogDescription>
								Upload a PDF to add as a source.
							</DialogDescription>
						</DialogHeader>

						<div className="flex-1 overflow-y-auto">
							<div className="flex flex-col gap-4 p-4">
								{extractError && (
									<p className="text-xs text-destructive rounded-md bg-destructive/10 px-3 py-2">
										{extractError}
									</p>
								)}

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
											{sourceTypes.map((t) => (
												<SelectItem key={t.id} value={t.id}>
													{t.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

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
										isExtracting={isExtracting}
									/>
								))}
							</div>
						</div>

						<div className="shrink-0 border-t px-4 py-3 flex items-center gap-2">
							<div className="flex-1">
								{!file ? (
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
										{file.name}
									</button>
								)}
							</div>

							{canExtract && (
								<Button
									variant="outline"
									onClick={handleExtract}
									disabled={!file || isExtracting || saving}
								>
									{isExtracting ? (
										<Loader2 size={12} className="animate-spin" />
									) : (
										<>
											<Clover size={12} /> ExtractPat
										</>
									)}
								</Button>
							)}

							<Button onClick={handleSave} disabled={!file || saving}>
								{saving ? (
									<Loader2 size={12} className="animate-spin" />
								) : (
									"Save"
								)}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
