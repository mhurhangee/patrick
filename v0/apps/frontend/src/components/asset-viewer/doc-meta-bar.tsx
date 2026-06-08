import type { DocMeta } from "@patrickos/shared"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { TagEditor } from "../tag-editor"

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

	// Reflect external changes (e.g. AgentPat's suggestSignpost) into the field.
	useEffect(() => {
		setSignpost(meta?.signpost ?? "")
	}, [meta?.signpost])

	function onSignpostChange(value: string) {
		setSignpost(value)
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => onSignpost(value), 600)
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
					<TagEditor tags={tags} onChange={onTags} />
				</div>
			)}
		</div>
	)
}
