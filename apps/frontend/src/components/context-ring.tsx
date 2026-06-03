import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
	return `${n}`
}

function formatUsd(n: number): string {
	if (n < 0.01) return "<$0.01"
	return `$${n.toFixed(n < 1 ? 3 : 2)}`
}

const R = 7
const CIRCUMFERENCE = 2 * Math.PI * R

// Context-usage ring for the chat input. Shows the provider's actual input-token
// count from the most recent turn ÷ the model's context window — exact, no
// client-side estimation (the agent's server-built prompt + tool schemas aren't
// visible here, so guessing was unreliable). Self-corrects every turn.
export function ContextRing({
	used,
	window,
	inputCostPerTurn,
}: {
	used: number
	window: number
	// Cost of re-sending the current context once (input tokens × input price).
	inputCostPerTurn?: number | null
}) {
	const fraction = Math.min(used / window, 1)
	const pct = Math.round((used / window) * 100)
	const color =
		pct >= 90
			? "text-red-500"
			: pct >= 70
				? "text-amber-500"
				: "text-muted-foreground"

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1 rounded px-1 hover:bg-muted"
					aria-label={`Context ${pct}% used`}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 18 18"
						className={color}
						role="img"
						aria-hidden="true"
					>
						<circle
							cx="9"
							cy="9"
							r={R}
							fill="none"
							stroke="currentColor"
							strokeOpacity="0.2"
							strokeWidth="2.5"
						/>
						<circle
							cx="9"
							cy="9"
							r={R}
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeDasharray={CIRCUMFERENCE}
							strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
							transform="rotate(-90 9 9)"
						/>
					</svg>
					<span className={cn("text-xxs tabular-nums", color)}>{pct}%</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-60 text-xs">
				<div className="flex items-baseline justify-between">
					<span className="font-medium">Context</span>
					<span className="tabular-nums text-muted-foreground">
						{formatTokens(used)} / {formatTokens(window)} ({pct}%)
					</span>
				</div>
				<p className="mt-1 text-xxs text-muted-foreground">
					Measured from your last message.
				</p>
				{inputCostPerTurn != null && (
					<div className="mt-2 flex justify-between border-t pt-2 tabular-nums">
						<span className="text-muted-foreground">Cost per turn (input)</span>
						<span>~{formatUsd(inputCostPerTurn)}</span>
					</div>
				)}
				<p className="mt-2 text-xxs text-muted-foreground">
					Open documents are re-sent every turn — close one to free space.
				</p>
			</PopoverContent>
		</Popover>
	)
}
