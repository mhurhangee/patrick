import type { DocMeta } from "@patrickos/shared"
import { ChevronDown, ChevronRight, X } from "lucide-react"
import { useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// A collapsible per-doc metadata header (signpost + tags), shown at the top of
// every document tab. The signpost is the one-liner the agent sees even when the
// doc is closed; tags are freeform triage labels. Both persist via docMeta.
// Mount one per doc (key by asset id) so the signpost draft seeds cleanly.
export function DocMetaBar({
	meta,
	onSignpost,
	onTags,
}: {
	meta: DocMeta | undefined
	onSignpost: (value: string) => void
	onTags: (tags: string[]) => void
}) {
	const tags = meta?.tags ?? []
	const [open, setOpen] = useState(false)
	const [signpost, setSignpost] = useState(meta?.signpost ?? "")
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	function onSignpostChange(value: string) {
		setSignpost(value)
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => onSignpost(value), 600)
	}

	function addTag(raw: string) {
		const t = raw.trim().toLowerCase()
		if (t && !tags.includes(t)) onTags([...tags, t])
	}

	function removeTag(t: string) {
		onTags(tags.filter((x) => x !== t))
	}

	return (
		<div className="shrink-0 border-b bg-muted/20 text-xs">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-foreground"
			>
				{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
				{open ? (
					<span className="font-medium">Signpost &amp; tags</span>
				) : signpost || tags.length ? (
					<span className="flex min-w-0 items-center gap-1.5">
						<span className="truncate">{signpost || "—"}</span>
						{tags.map((t) => (
							<span
								key={t}
								className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-foreground"
							>
								{t}
							</span>
						))}
					</span>
				) : (
					<span className="text-muted-foreground/60">
						Add a signpost &amp; tags
					</span>
				)}
			</button>

			{open && (
				<div className="space-y-2 px-3 pb-2 pl-[26px]">
					<Textarea
						value={signpost}
						onChange={(e) => onSignpostChange(e.target.value)}
						onBlur={() => onSignpost(signpost)}
						placeholder="One line — what is this document? The agent sees this even when the doc is closed."
						rows={2}
						className="min-h-0 resize-none bg-background p-2 text-xs"
					/>
					<div className="flex flex-wrap items-center gap-1">
						{tags.map((t) => (
							<span
								key={t}
								className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[11px]"
							>
								{t}
								<button
									type="button"
									onClick={() => removeTag(t)}
									className="text-muted-foreground hover:text-foreground"
								>
									<X size={10} />
								</button>
							</span>
						))}
						<input
							type="text"
							placeholder="add tag…"
							className={cn(
								"min-w-[80px] flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50",
							)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === ",") {
									e.preventDefault()
									addTag(e.currentTarget.value)
									e.currentTarget.value = ""
								}
							}}
							onBlur={(e) => {
								addTag(e.currentTarget.value)
								e.currentTarget.value = ""
							}}
						/>
					</div>
				</div>
			)}
		</div>
	)
}
