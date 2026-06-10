import type { PinnedSource } from "@patrick/shared";
import {
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	FileText,
	GitFork,
	Pencil,
	Pin,
	RotateCcw,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTokens } from "@/lib/format";

export type ExchangePanelData = {
	model: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	costUsd: number | null;
	totalConversationCostUsd: number | null;
	durationMs: number | null;
	ttftMs: number | null;
	pinnedSources: PinnedSource[];
	activeDraft: string | null;
	tools: string[];
};

function formatCost(usd: number): string {
	if (usd < 0.00005) return "<$0.0001";
	if (usd < 0.01) return `$${usd.toFixed(4)}`;
	return `$${usd.toFixed(3)}`;
}

function Action({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClick}
					className="size-6 text-muted-foreground/40 hover:text-muted-foreground"
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div>
			<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
				{label}
			</p>
			<div className="text-muted-foreground/70">{children}</div>
		</div>
	);
}

// Per-exchange audit summary, shown once a turn completes. Actions on top; the
// expandable body is the observability surface — what was actually sent + cost.
export function ExchangePanel({
	data,
	isExpanded,
	onToggle,
	onCopy,
	onEdit,
	onRetry,
	onFork,
}: {
	data: ExchangePanelData;
	isExpanded: boolean;
	onToggle: () => void;
	onCopy: () => void;
	/** Edit & resend — latest exchange only. */
	onEdit?: () => void;
	onRetry?: () => void;
	onFork: () => void;
}) {
	const [copied, setCopied] = useState(false);

	function handleCopy() {
		onCopy();
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="flex flex-col pb-2">
			<div className="flex items-center justify-between px-1 py-1">
				<div className="flex items-center gap-0.5">
					<Action
						label={copied ? "Copied" : "Copy response"}
						onClick={handleCopy}
					>
						{copied ? <Check /> : <Copy />}
					</Action>
					{onEdit && (
						<Action label="Edit & resend" onClick={onEdit}>
							<Pencil />
						</Action>
					)}
					{onRetry && (
						<Action label="Retry" onClick={onRetry}>
							<RotateCcw />
						</Action>
					)}
					<Action label="Fork to a new chat" onClick={onFork}>
						<GitFork />
					</Action>
				</div>
				<button
					type="button"
					onClick={onToggle}
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground"
				>
					{data.inputTokens != null && data.outputTokens != null && (
						<span className="tabular-nums">
							{formatTokens(data.inputTokens + data.outputTokens)} tok
						</span>
					)}
					{data.costUsd != null && (
						<span className="tabular-nums">· {formatCost(data.costUsd)}</span>
					)}
					{isExpanded ? (
						<ChevronUp className="size-3" />
					) : (
						<ChevronDown className="size-3" />
					)}
				</button>
			</div>

			{isExpanded && (
				<div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-3 px-1 pb-2 text-xs">
					<Cell label="Model">
						<span className="truncate">{data.model ?? "—"}</span>
					</Cell>
					<Cell label="Tokens">
						{data.inputTokens != null && data.outputTokens != null
							? `${formatTokens(data.inputTokens)} in · ${formatTokens(data.outputTokens)} out`
							: "—"}
					</Cell>
					<Cell label="Cost">
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
					</Cell>
					<Cell label="Time">
						{data.durationMs != null ? (
							<>
								{(data.durationMs / 1000).toFixed(1)}s
								{data.ttftMs != null && (
									<span className="ml-1 text-muted-foreground/40">
										· {(data.ttftMs / 1000).toFixed(1)}s to first token
									</span>
								)}
							</>
						) : (
							"—"
						)}
					</Cell>
					<Cell label="Tools">
						{data.tools.length > 0 ? data.tools.join(", ") : "None"}
					</Cell>
					<Cell label="Active draft">
						{data.activeDraft ? (
							<span className="inline-flex items-center gap-1">
								<FileText className="size-3 shrink-0" />
								<span className="truncate">{data.activeDraft}</span>
							</span>
						) : (
							"None"
						)}
					</Cell>
					<div className="col-span-2">
						<p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
							Pinned sources (context)
						</p>
						{data.pinnedSources.length > 0 ? (
							<div className="flex flex-wrap gap-1">
								{data.pinnedSources.map((s) => (
									<span
										key={s.filename}
										className="inline-flex items-center gap-1 rounded border border-muted-foreground/20 px-1.5 py-0.5 text-[11px] text-muted-foreground/70"
									>
										<Pin className="size-2.5" />
										{s.filename}
									</span>
								))}
							</div>
						) : (
							<p className="text-muted-foreground/70">None</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
