import type { SurfaceId } from "@patrickos/shared"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { FormattedView } from "./formatted-view"
import { RawEditor } from "./raw-editor"

type Preview = {
	system: string
	perToken: Record<string, string>
	warnings: string[]
}

// The prompt template editor: a CodeMirror "Raw" source view (token pills you
// click to expand inline, hover for the explanation) and a read-only
// "Formatted" preview, sharing one <TOKEN> string. Live values come from
// /prompt/render against the active task.
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
	const [tab, setTab] = useState<"raw" | "formatted">("raw")
	const [preview, setPreview] = useState<Preview | null>(null)

	// Debounced live render — same engine the AI uses, so the preview can't drift.
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

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-1">
				{(["raw", "formatted"] as const).map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => setTab(t)}
						className={cn(
							"rounded px-2.5 py-1 text-xs capitalize transition-colors",
							tab === t
								? "bg-muted font-medium text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{t}
					</button>
				))}
				{!taskPath && (
					<span className="ml-auto text-[11px] text-muted-foreground italic">
						open a task for live preview values
					</span>
				)}
			</div>

			<div className="h-[380px] overflow-auto rounded-md border bg-background">
				{tab === "raw" ? (
					<RawEditor
						value={value}
						onChange={onChange}
						surface={surface}
						perToken={perToken}
					/>
				) : (
					<FormattedView
						template={value}
						surface={surface}
						perToken={perToken}
					/>
				)}
			</div>

			{warnings.length > 0 && (
				<ul className="space-y-0.5 text-[11px] text-amber-600 dark:text-amber-500">
					{warnings.map((wn) => (
						<li key={wn}>⚠ {wn}</li>
					))}
				</ul>
			)}
		</div>
	)
}
