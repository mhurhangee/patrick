import {
	ArrowUpRight,
	Brain,
	Cpu,
	FileImage,
	FileText,
	Lock,
	Pencil,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { InfoTooltip } from "@/components/ui/tooltip";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DocKind } from "@/lib/workspace";

function formatUsd(n: number): string {
	if (n < 0.01) return "<$0.01";
	return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

const R = 7;
const CIRCUMFERENCE = 2 * Math.PI * R;

export type ContextSource = {
	filename: string;
	label: string;
	kind: DocKind;
	/** Estimated tokens this source costs; null when its size isn't known yet. */
	tokens: number | null;
};

function tok(n: number | null): string {
	return n == null ? "~?" : `~${formatTokens(n)}`;
}

function SourceRow({
	source,
	onClose,
}: {
	source: ContextSource;
	onClose?: (filename: string) => void;
}) {
	const Icon = source.kind === "pdf" ? FileImage : FileText;
	return (
		<div className="flex items-center gap-1.5 py-0.5">
			<Icon className="size-3.5 shrink-0 text-muted-foreground/70" />
			<span className="min-w-0 flex-1 truncate" title={source.label}>
				{source.label}
			</span>
			<span className="shrink-0 tabular-nums text-muted-foreground">
				{tok(source.tokens)}
			</span>
			{onClose && (
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => onClose(source.filename)}
					tooltip="Close — don't send this document"
					className="shrink-0 text-muted-foreground/60"
				>
					<X className="size-3" />
				</Button>
			)}
		</div>
	);
}

// The chat's context, in the composer toolbar. One affordance across a chat's
// life: before the first message it estimates what's about to be sent (open
// sources you can still close); after, it shows the provider's exact last-turn
// usage plus the pinned sources (immutable) and the locked model. The ring fills
// by the live basis — estimate pre-send, actual post-send.
export function ContextRing({
	pinned,
	candidates,
	onClose,
	onCloseAll,
	onEditPrompt,
	activeDraftLabel,
	used,
	estimated,
	window,
	inputCostPerTurn,
	modelName,
}: {
	pinned: ContextSource[];
	candidates: ContextSource[];
	onClose: (filename: string) => void;
	onCloseAll?: () => void;
	/** Jump to the profile's prompt section (where instructions + abilities live). */
	onEditPrompt?: () => void;
	/** The editable draft Patrick reads live via tools (not sent as static context). */
	activeDraftLabel?: string | null;
	/** Exact input tokens from the last turn; null before the first send. */
	used: number | null;
	/** Estimated tokens about to be sent (pinned + open candidates). */
	estimated: number;
	window: number;
	/** Cost of re-sending the current context once (input tokens × input price). */
	inputCostPerTurn?: number | null;
	/** The model locked for this chat — shown once a chat is going. */
	modelName?: string | null;
}) {
	const basis = used ?? estimated;
	const fraction = Math.min(basis / window, 1);
	const pct = Math.round((basis / window) * 100);
	const color =
		pct >= 90
			? "text-red-500"
			: pct >= 75
				? "text-amber-500"
				: pct >= 50
					? "text-yellow-500"
					: "text-muted-foreground";
	const warning =
		pct >= 90
			? "Context is nearly full — start a new chat to keep responses reliable."
			: pct >= 75
				? "Context is getting large — a new chat keeps things sharp."
				: null;
	const empty =
		pinned.length === 0 && candidates.length === 0 && !activeDraftLabel;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1 px-1"
					aria-label={`Context ${pct}% used`}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 18 18"
						className={cn("size-4", color)}
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
					<span className={cn("text-[10px] tabular-nums", color)}>{pct}%</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 gap-0 text-xs">
				{/* Headline: the model (once locked) + a one-line "why it matters". */}
				<div className="flex items-center gap-1.5">
					{modelName && used != null && (
						<>
							<Cpu className="size-3.5 shrink-0 text-emerald-600" />
							<span className="min-w-0 flex-1 truncate font-medium">
								{modelName}
							</span>
							<InfoTooltip label="Locked for this chat — start a new chat to change the model">
								<span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
									<Lock className="size-2.5" />
									Locked
								</span>
							</InfoTooltip>
						</>
					)}
					{!(modelName && used != null) && (
						<span className="flex-1 font-medium">Context</span>
					)}
				</div>
				<p className="mt-0.5 text-[10px] text-muted-foreground">
					More context costs more and can dull focus.
				</p>

				<div className="mt-2 flex items-baseline justify-between border-t pt-2.5">
					<span className="text-muted-foreground">
						{used != null ? "Used last message" : "About to send"}
					</span>
					<span className={cn("font-medium tabular-nums", color)}>
						{used != null ? formatTokens(used) : `~${formatTokens(estimated)}`}{" "}
						/ {formatTokens(window)} · {pct}%
					</span>
				</div>
				{warning && (
					<p
						className={cn(
							"mt-1.5 font-medium",
							pct >= 90 ? "text-red-500" : "text-amber-500",
						)}
					>
						{warning}
					</p>
				)}

				{/* One divider, then the pieces that make up that total. */}
				<div className="mt-3 space-y-3 border-t pt-2.5">
					{candidates.length > 0 && (
						<div>
							<div className="mb-1 flex items-center justify-between text-muted-foreground">
								<span className="font-medium text-foreground">
									Will send · {candidates.length}
								</span>
								{candidates.length > 1 && onCloseAll && (
									<Button
										variant="link"
										size="xs"
										onClick={onCloseAll}
										className="h-auto p-0 text-[10px] text-muted-foreground hover:text-foreground"
									>
										Close all
									</Button>
								)}
							</div>
							{candidates.map((s) => (
								<SourceRow key={s.filename} source={s} onClose={onClose} />
							))}
						</div>
					)}

					{pinned.length > 0 && (
						<div>
							<p className="mb-1 flex items-center gap-1 font-medium">
								<Lock className="size-2.5 text-muted-foreground" />
								Pinned · {pinned.length}
							</p>
							{pinned.map((s) => (
								<SourceRow key={s.filename} source={s} />
							))}
						</div>
					)}

					{activeDraftLabel && (
						<div className="flex items-center gap-1.5 text-muted-foreground">
							<Pencil className="size-3.5 shrink-0" />
							<span
								className="min-w-0 flex-1 truncate"
								title={activeDraftLabel}
							>
								{activeDraftLabel}
							</span>
							<span className="shrink-0 text-[10px]">draft · read live</span>
						</div>
					)}

					{empty && (
						<p className="text-muted-foreground">
							No documents yet — open a source to include it.
						</p>
					)}

					{inputCostPerTurn != null && (
						<div className="flex justify-between tabular-nums">
							<span className="text-muted-foreground">
								Cost per turn (input)
							</span>
							<span>~{formatUsd(inputCostPerTurn)}</span>
						</div>
					)}

					{onEditPrompt && (
						<div className="border-t pt-2">
							<Button
								variant="link"
								onClick={onEditPrompt}
								className="gap-1.5 text-muted-foreground hover:text-foreground p-0"
							>
								<Brain />
								Patrick's instructions: see in your profile
								<ArrowUpRight className="size-3 shrink-0 text-xs text-base" />
							</Button>
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
