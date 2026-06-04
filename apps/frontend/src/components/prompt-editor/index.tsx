import type { SurfaceId } from "@patrickos/shared"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { FormattedView } from "./formatted-view"
import { RawEditor } from "./raw-editor"

type Preview = {
	system: string
	perToken: Record<string, string>
	warnings: string[]
}

// The prompt template editor: the raw <TOKEN> source on the left (the thing
// that's saved), a live rendered preview with resolved values on the right.
// Clicking a token in the source jumps the preview to it. Live values come from
// /prompt/render against the active task — same engine the AI uses.
export function PromptEditor({
	surface,
	value,
	onChange,
	taskPath,
}: {
	surface: SurfaceId
	value: string
	onChange: (v: string) => void
	taskPath?: string
}) {
	const [preview, setPreview] = useState<Preview | null>(null)
	const previewRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		let cancelled = false
		const t = setTimeout(() => {
			api.prompt
				.render({ surface, template: value, taskPath })
				.then((r) => {
					if (!cancelled) setPreview(r)
				})
				.catch(() => {
					if (!cancelled) setPreview(null)
				})
		}, 400)
		return () => {
			cancelled = true
			clearTimeout(t)
		}
	}, [surface, value, taskPath])

	const perToken = preview?.perToken ?? {}
	const warnings = preview?.warnings ?? []

	function jumpToToken(name: string) {
		previewRef.current
			?.querySelector(`[data-token="${name}"]`)
			?.scrollIntoView({ block: "center", behavior: "smooth" })
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
				{/* Source — the editable, saved template */}
				<div className="flex flex-col overflow-hidden rounded-md border bg-background">
					<div className="shrink-0 border-b px-3 py-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						Source
					</div>
					<div className="min-h-0 flex-1 overflow-auto">
						<RawEditor
							value={value}
							onChange={onChange}
							surface={surface}
							onTokenClick={jumpToToken}
						/>
					</div>
				</div>

				{/* Preview — rendered, with live token values */}
				<div className="flex flex-col overflow-hidden rounded-md border bg-muted/20">
					<div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						<span>Preview</span>
						{!taskPath && (
							<span className="text-muted-foreground/70 normal-case">
								no task open — limited values
							</span>
						)}
					</div>
					<div ref={previewRef} className="min-h-0 flex-1 overflow-auto">
						<FormattedView
							template={value}
							surface={surface}
							perToken={perToken}
						/>
					</div>
				</div>
			</div>

			{warnings.length > 0 && (
				<ul className="shrink-0 space-y-0.5 text-[11px] text-amber-600 dark:text-amber-500">
					{warnings.map((wn) => (
						<li key={wn}>⚠ {wn}</li>
					))}
				</ul>
			)}
		</div>
	)
}
