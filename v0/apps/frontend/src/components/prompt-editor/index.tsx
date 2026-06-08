import type { SurfaceId } from "@patrickos/shared"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { FormattedView } from "./formatted-view"
import { RawEditor, type RawEditorHandle } from "./raw-editor"
import { TokenShelf } from "./token-shelf"

type Preview = {
	system: string
	perToken: Record<string, string>
	warnings: string[]
}

// The prompt template editor:
//  - a token shelf (available tokens not in the prompt, click to insert)
//  - Source (left): the editable <TOKEN> template, each token annotated with its
//    description. Clicking a pill scrolls the preview to it.
//  - Preview (right): the rendered prompt with live resolved values. Clicking a
//    chip scrolls the source to it.
// Live values come from /prompt/render against the active task.
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
	const rawRef = useRef<RawEditorHandle>(null)
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

	// Source pill click → scroll the preview to that token.
	function scrollPreviewTo(name: string) {
		previewRef.current
			?.querySelector(`[data-token="${name}"]`)
			?.scrollIntoView({ block: "center", behavior: "smooth" })
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<TokenShelf
				surface={surface}
				value={value}
				onInsert={(name) => rawRef.current?.insertToken(name)}
			/>

			<div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
				{/* Source — editable template, tokens annotated with descriptions */}
				<div className="flex flex-col overflow-hidden rounded-md border bg-background">
					<div className="shrink-0 border-b px-3 py-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						Source
					</div>
					<div className="min-h-0 flex-1 overflow-auto">
						<RawEditor
							ref={rawRef}
							value={value}
							onChange={onChange}
							surface={surface}
							onTokenClick={scrollPreviewTo}
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
							onTokenClick={(name) => rawRef.current?.scrollToToken(name)}
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
