import { isTokenId, type SurfaceId } from "@patrickos/shared"
import { useEffect, useState } from "react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { FormattedView } from "./formatted-view"
import { TokenInspector } from "./inspector"
import { RawEditor } from "./raw-editor"

type Preview = {
	system: string
	perToken: Record<string, string>
	warnings: string[]
}

type Inspect = { name: string; rect: DOMRect }

// The prompt template editor: a CodeMirror "Raw" source view (with smart token
// pills) and a read-only "Formatted" preview, sharing one <TOKEN> string. Live
// preview values come from /prompt/render against the active task.
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
	const [inspect, setInspect] = useState<Inspect | null>(null)

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
						onInspect={(name, rect) => setInspect({ name, rect })}
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

			{/* Inspector popover for tokens clicked in the Raw editor. */}
			<Popover
				open={!!inspect}
				onOpenChange={(o) => {
					if (!o) setInspect(null)
				}}
			>
				<PopoverAnchor asChild>
					<div
						style={{
							position: "fixed",
							left: inspect?.rect.left ?? 0,
							top: inspect?.rect.bottom ?? 0,
							width: 0,
							height: 0,
						}}
					/>
				</PopoverAnchor>
				<PopoverContent align="start" className="w-80">
					{inspect && isTokenId(inspect.name) ? (
						<TokenInspector
							tokenId={inspect.name}
							surface={surface}
							value={perToken[inspect.name]}
						/>
					) : (
						<p className="text-muted-foreground text-xs">
							Unknown token <code>&lt;{inspect?.name}&gt;</code> — left in the
							prompt as-is.
						</p>
					)}
				</PopoverContent>
			</Popover>
		</div>
	)
}
