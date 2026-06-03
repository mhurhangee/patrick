import {
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	GitFork,
	Pencil,
	RotateCcw,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"

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
}

function formatCost(usd: number): string {
	if (usd < 0.00005) return "<$0.0001"
	if (usd < 0.01) return `$${usd.toFixed(4)}`
	return `$${usd.toFixed(3)}`
}

function formatTokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// Icon button with a tooltip — the per-exchange actions.
function Action({
	label,
	onClick,
	className,
	children,
}: {
	label: string
	onClick: () => void
	className?: string
	children: ReactNode
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onClick}
					className={className}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

// Per-exchange audit summary, shown after the response completes.
export function ExchangePanel({
	data,
	isExpanded,
	onToggle,
	onCopy,
	onFork,
	onEdit,
	onRetry,
}: {
	data: ExchangePanelData
	isExpanded: boolean
	onToggle: () => void
	onCopy: () => void
	onFork: () => void
	// Edit (redo) and Retry only apply to the latest exchange.
	onEdit?: () => void
	onRetry?: () => void
}) {
	const [copied, setCopied] = useState(false)
	const actionClass = "text-muted-foreground/40 hover:text-muted-foreground"

	function handleCopy() {
		onCopy()
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<div className="flex flex-col pb-8">
			{/* Toggle bar */}
			<div className="flex w-full items-center justify-between px-3 py-2">
				<div className="flex items-center gap-1">
					<Action
						label={copied ? "Copied" : "Copy response"}
						onClick={handleCopy}
						className={actionClass}
					>
						{copied ? <Check size={13} /> : <Copy size={13} />}
					</Action>
					{onEdit && (
						<Action
							label="Edit & resend"
							onClick={onEdit}
							className={actionClass}
						>
							<Pencil size={13} />
						</Action>
					)}
					{onRetry && (
						<Action label="Retry" onClick={onRetry} className={actionClass}>
							<RotateCcw size={13} />
						</Action>
					)}
					<Action
						label="Fork to a new chat"
						onClick={onFork}
						className={actionClass}
					>
						<GitFork size={13} />
					</Action>
				</div>
				<Action
					label={isExpanded ? "Hide details" : "Show details"}
					onClick={onToggle}
					className="text-muted-foreground/30 hover:text-muted-foreground"
				>
					{isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
				</Action>
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
					</div>
				</div>
			)}
		</div>
	)
}
