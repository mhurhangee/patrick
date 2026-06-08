import { X } from "lucide-react"
import { cn } from "@/lib/utils"

// Freeform tag chips with an inline add-input. Adds on Enter/comma/blur,
// lowercased + de-duped; removes via the chip ✕. Used by the doc-meta header and
// the source-management screen.
export function TagEditor({
	tags,
	onChange,
	className,
}: {
	tags: string[]
	onChange: (tags: string[]) => void
	className?: string
}) {
	function add(raw: string) {
		const t = raw.trim().toLowerCase()
		if (t && !tags.includes(t)) onChange([...tags, t])
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-1", className)}>
			{tags.map((t) => (
				<span
					key={t}
					className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[11px]"
				>
					{t}
					<button
						type="button"
						onClick={() => onChange(tags.filter((x) => x !== t))}
						className="text-muted-foreground hover:text-foreground"
					>
						<X size={10} />
					</button>
				</span>
			))}
			<input
				type="text"
				placeholder="add tag…"
				className="min-w-[70px] flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50"
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === ",") {
						e.preventDefault()
						add(e.currentTarget.value)
						e.currentTarget.value = ""
					}
				}}
				onBlur={(e) => {
					add(e.currentTarget.value)
					e.currentTarget.value = ""
				}}
			/>
		</div>
	)
}
