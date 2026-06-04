import type { FieldMeta } from "@patrickos/shared"
import { MapPin } from "lucide-react"
import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// Salvaged from the old edit-source-dialog — reused by the extraction view.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function DetailsField({
	field,
	value,
	onChange,
	isExtracting,
	onLocate,
	hasLocation,
}: {
	field: FieldMeta
	value: unknown
	onChange: (v: unknown) => void
	isExtracting: boolean
	/** Jump to this field's location in the document, if any. */
	onLocate?: () => void
	hasLocation?: boolean
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
			<div className="flex items-center justify-between">
				<Label className="text-xs font-medium">{field.label}</Label>
				{hasLocation && onLocate && (
					<button
						type="button"
						onClick={onLocate}
						title="Locate in document"
						className="text-muted-foreground hover:text-primary"
					>
						<MapPin size={12} />
					</button>
				)}
			</div>
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
