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
	inputTokens: number | null
	outputTokens: number | null
	costUsd: number | null
	totalConversationCostUsd: number | null
	durationMs: number | null
	ttftMs: number | null
	context: Array<{ id: string; title: string }>
	tools: string[]
	sources: string[]
	suggestions: string[] | null
	chatTitle: string | null
	lastMessageSummary: string | null
}

function formatCost(usd: number): string {
	if (usd < 0.00005) return "<$0.0001"
	if (usd < 0.01) return `$${usd.toFixed(4)}`
	return `$${usd.toFixed(3)}`
}

function formatTokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
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
	onSuggestion,
}: {
	data: ExchangePanelData
	isExpanded: boolean
	minHeight: number
	onToggle: () => void
	onSuggestion: (text: string) => void
}) {
	return (
		<div
			className="flex flex-col bg-muted/20"
			style={isExpanded ? { minHeight } : undefined}
		>
			{/* Toggle bar */}
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
					{/* Info grid */}
					<div className="mb-12 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
						{/* Row 1: Model | Tokens */}
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Model
							</p>
							<p className="truncate text-muted-foreground/60">{data.model}</p>
						</div>
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Tokens
							</p>
							<p className="text-muted-foreground/60">
								{data.inputTokens != null && data.outputTokens != null
									? `${formatTokens(data.inputTokens)} in · ${formatTokens(data.outputTokens)} out`
									: "—"}
							</p>
						</div>

						{/* Row 2: Cost | Time */}
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Cost
							</p>
							<p className="text-muted-foreground/60">
								{data.costUsd != null ? (
									<>
										{formatCost(data.costUsd)}
										{data.totalConversationCostUsd != null && (
											<span className="ml-1 text-muted-foreground/40">
												· {formatCost(data.totalConversationCostUsd)} total
											</span>
										)}
									</>
								) : (
									"—"
								)}
							</p>
						</div>
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Time
							</p>
							<p className="text-muted-foreground/60">
								{data.durationMs != null ? (
									<>
										{(data.durationMs / 1000).toFixed(1)}s
										{data.ttftMs != null && (
											<span className="ml-1 text-muted-foreground/40">
												· {(data.ttftMs / 1000).toFixed(1)}s TTFT
											</span>
										)}
									</>
								) : (
									"—"
								)}
							</p>
						</div>

						{/* Row 3: Tools | Sources */}
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Tools
							</p>
							<p className="text-muted-foreground/60">
								{data.tools.length > 0 ? data.tools.join(", ") : "None"}
							</p>
						</div>
						<div>
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Sources
							</p>
							<p className="text-muted-foreground/60">
								{data.sources.length > 0 ? data.sources.join(", ") : "None"}
							</p>
						</div>

						{/* Row 4: Context (full width) */}
						<div className="col-span-2">
							<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
								Context
							</p>
							{data.context.length > 0 ? (
								<div className="flex flex-wrap gap-1">
									{data.context.map((asset) => (
										<span
											key={asset.id}
											className="rounded border border-muted-foreground/20 px-1.5 py-0.5 text-[11px] text-muted-foreground/60"
										>
											{asset.title}
										</span>
									))}
								</div>
							) : (
								<p className="text-muted-foreground/60">No assets</p>
							)}
						</div>

						{/* Row 5: Chat title (full width, only when model generated it) */}
						{data.chatTitle && (
							<div className="col-span-2">
								<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
									Chat title
								</p>
								<p className="text-muted-foreground/60">{data.chatTitle}</p>
							</div>
						)}

						{/* Row 6: Response summary (full width) */}
						{data.lastMessageSummary && (
							<div className="col-span-2">
								<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
									Summary
								</p>
								<p className="text-muted-foreground/60">
									{data.lastMessageSummary}
								</p>
							</div>
						)}
					</div>

					{/* Suggestions */}
					{data.suggestions && (
						<div className="flex flex-wrap gap-2">
							{data.suggestions.map((s) => (
								<Button
									key={s}
									variant="secondary"
									size="sm"
									className="h-7 rounded-full text-xs"
									onClick={() => onSuggestion(s)}
								>
									{s}
								</Button>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
