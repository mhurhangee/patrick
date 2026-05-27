import {
	BadgeCheck,
	ChevronDown,
	ChevronUp,
	Copy,
	GitFork,
	RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export type ExchangePanelData = {
	model: string
	tokenCount: number | null
	durationMs: number | null
}

// Shown during streaming — holds the space so the user message stays at top
export function StreamingSpacer({ minHeight }: { minHeight: number }) {
	return (
		<div
			style={{ minHeight }}
			className="flex items-start bg-muted/20 px-5 pt-5"
		>
			<span className="animate-pulse text-xs text-muted-foreground/40">
				Thinking…
			</span>
		</div>
	)
}

// Shown after streaming ends — same minHeight so there's no layout shift on swap.
export function ExchangePanel({
	data,
	isExpanded,
	minHeight,
	onToggle,
}: {
	data: ExchangePanelData
	isExpanded: boolean
	minHeight: number
	onToggle: () => void
}) {
	return (
		<div
			className="flex flex-col bg-muted/20"
			style={isExpanded ? { minHeight } : undefined}
		>
			{/* Toggle bar — full width, actions left, chevron right */}
			<div className="flex w-full items-center justify-between px-3 py-2">
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground/40 hover:text-muted-foreground"
					>
						<Copy size={13} />
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground/40 hover:text-muted-foreground"
					>
						<RotateCcw size={13} />
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground/40 hover:text-muted-foreground"
					>
						<GitFork size={13} />
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground/40 hover:text-muted-foreground"
					>
						<BadgeCheck size={13} />
					</Button>
				</div>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onToggle}
					className="text-muted-foreground/30 hover:text-muted-foreground"
				>
					{isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
				</Button>
			</div>

			{isExpanded && (
				<div className="px-5 pt-1 pb-10">
					{/* Info — model, usage, tools, context */}
					<div className="mb-12 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Model
							</p>
							<p className="truncate text-muted-foreground/60">{data.model}</p>
						</div>
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Usage
							</p>
							<p className="text-muted-foreground/60">
								{data.tokenCount != null
									? `${data.tokenCount.toLocaleString()} tok`
									: "—"}
								{data.durationMs != null &&
									` · ${(data.durationMs / 1000).toFixed(1)}s`}
							</p>
						</div>
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Tools
							</p>
							<p className="text-muted-foreground/60">None</p>
						</div>
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Context
							</p>
							<p className="text-muted-foreground/60">No assets</p>
						</div>
					</div>

					{/* Suggestions */}
					<div className="flex flex-wrap gap-2">
						{["Draft §103 response", "Amend claims", "Search prior art"].map(
							(s) => (
								<Button
									key={s}
									variant="secondary"
									size="sm"
									className="h-7 rounded-full text-xs"
								>
									{s}
								</Button>
							),
						)}
					</div>
				</div>
			)}
		</div>
	)
}
