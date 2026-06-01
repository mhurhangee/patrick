import type { ApiAsset } from "@patrickos/shared"
import {
	type AssetType,
	emptyDetails,
	type FieldMeta,
	getFormFields,
	isExtractable,
	mergeExtracted,
} from "@patrickos/shared"
import { Clover, Loader2 } from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { api, BASE_URL } from "@/lib/api"
import { cn } from "@/lib/utils"
import { SourceViewer } from "./source-viewer"

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

// ─── Edit source dialog ───────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved"
type ExtractState = "idle" | "extracting" | "done" | "error"

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

export function EditSourceDialog({
	asset,
	open,
	onOpenChange,
	provider,
	apiKey,
	model,
	onSaved,
	onDeleted,
}: {
	asset: ApiAsset
	open: boolean
	onOpenChange: (v: boolean) => void
	provider: string
	apiKey: string
	model: string
	onSaved: (asset: ApiAsset) => void
	onDeleted: (id: string) => void
}) {
	const [type, setType] = useState<AssetType>(asset.type as AssetType)
	const [details, setDetails] = useState<Record<string, unknown>>(() => ({
		...emptyDetails(asset.type),
		...(typeof asset.details === "string"
			? (JSON.parse(asset.details) as Record<string, unknown>)
			: (asset.details ?? {})),
	}))
	const [savedType, setSavedType] = useState<AssetType>(asset.type as AssetType)
	const [savedDetails, setSavedDetails] =
		useState<Record<string, unknown>>(details)
	const [deleteOpen, setDeleteOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [extractState, setExtractState] = useState<ExtractState>("idle")
	const [extractError, setExtractError] = useState<string | null>(null)
	const { status: saveStatus, wrap } = useSaveButton()

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on open/asset identity
	useEffect(() => {
		if (!open) return
		const t = asset.type as AssetType
		const merged = {
			...emptyDetails(t),
			...(typeof asset.details === "string"
				? (JSON.parse(asset.details) as Record<string, unknown>)
				: (asset.details ?? {})),
		}
		setType(t)
		setDetails(merged)
		setSavedType(t)
		setSavedDetails(merged)
		setDeleteOpen(false)
		setDeleting(false)
		setExtractState("idle")
		setExtractError(null)
	}, [open, asset.id])

	const isDirty =
		type !== savedType ||
		JSON.stringify(details) !== JSON.stringify(savedDetails)
	const canExtract = !!apiKey && isExtractable(type)
	const isExtracting = extractState === "extracting"
	const formFields = getFormFields(type)

	async function handleExtract() {
		setExtractState("extracting")
		setExtractError(null)
		try {
			const result = await api.extractpat.extract(
				asset.path ?? asset.id,
				asset.type,
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
		await wrap(async () => {
			// biome-ignore lint/suspicious/noExplicitAny: legacy dialog, being rewritten
			const updated = await (api.assets.update as any)(asset.id, {
				title: String(details.title ?? "").trim() || "Untitled",
				date: String(details.date ?? ""),
				notes: String(details.notes ?? ""),
				type,
				details,
			})
			setSavedType(updated.type as AssetType)
			setSavedDetails(details)
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
			<DialogContent className="overflow-hidden p-0 md:max-w-[1100px]">
				<div className="flex" style={{ height: "min(840px, 85vh)" }}>
					{/* Left — PDF preview */}
					<div className="w-[45%] border-r overflow-hidden">
						<SourceViewer src={`${BASE_URL}/assets/${asset.id}/file`} />
					</div>

					{/* Right — form */}
					<div className="flex flex-col flex-1 overflow-hidden">
						<DialogHeader>
							<DialogTitle>Edit Source</DialogTitle>
							<DialogDescription>
								Edit the source's details and save your changes.
							</DialogDescription>
						</DialogHeader>

						<div className="flex-1 overflow-y-auto">
							<div className="flex flex-col gap-4 p-4">
								{extractError && (
									<p className="text-xs text-destructive rounded-md bg-destructive/10 px-3 py-2">
										{extractError}
									</p>
								)}

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

						<div className="shrink-0 border-t px-4 py-3 flex items-center justify-between gap-2">
							<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
								<AlertDialogTrigger asChild>
									<Button variant="destructive">Delete</Button>
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>Delete source?</AlertDialogTitle>
										<AlertDialogDescription>
											"{asset.title}" will be permanently removed. This cannot
											be undone.
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

							<div className="flex items-center gap-2">
								{canExtract && (
									<Button
										variant="outline"
										onClick={handleExtract}
										disabled={isExtracting}
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
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
