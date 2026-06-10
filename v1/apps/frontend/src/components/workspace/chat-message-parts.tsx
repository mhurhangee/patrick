import {
	type DynamicToolUIPart,
	getToolName,
	isToolUIPart,
	type ToolUIPart,
	type UIMessage,
} from "ai";
import { ChevronRight, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

type Part = UIMessage["parts"][number];
type AnyToolPart = ToolUIPart | DynamicToolUIPart;

// How each docx tool presents in the chain-of-thought trail: a friendly label, a
// present-continuous "running" verb, and a one-line summary of what it did.
type Presenter = {
	label: string;
	runningLabel: string;
	// biome-ignore lint/suspicious/noExplicitAny: tool input/output shapes vary
	summary?: (input: any, output: any) => string | null;
};

const PRESENTERS: Record<string, Presenter> = {
	read_document: {
		label: "Read the document",
		runningLabel: "Reading the document…",
	},
	read_selection: {
		label: "Read the selection",
		runningLabel: "Reading the selection…",
	},
	read_page: { label: "Read a page", runningLabel: "Reading a page…" },
	read_pages: { label: "Read pages", runningLabel: "Reading pages…" },
	find_text: {
		label: "Find text",
		runningLabel: "Searching the document…",
		summary: (input) => input?.query ?? input?.text ?? null,
	},
	read_changes: {
		label: "Review tracked changes",
		runningLabel: "Reviewing changes…",
	},
	read_comments: { label: "Read comments", runningLabel: "Reading comments…" },
	add_comment: {
		label: "Add a comment",
		runningLabel: "Adding a comment…",
		summary: (input) => input?.text ?? null,
	},
	suggest_change: {
		label: "Suggest a change",
		runningLabel: "Proposing a tracked change…",
		summary: (input) =>
			input?.replaceWith ?? input?.replacement ?? input?.search ?? null,
	},
};

function humanize(name: string): string {
	const spaced = name
		.replace(/_/g, " ")
		.replace(/([A-Z])/g, " $1")
		.trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function JsonView({ value }: { value: unknown }) {
	if (value == null) return null;
	const text =
		typeof value === "string" ? value : JSON.stringify(value, null, 2);
	return (
		<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
			{text}
		</pre>
	);
}

function ToolDetail({ part }: { part: AnyToolPart }) {
	return (
		<div className="space-y-2">
			{part.input != null && (
				<div>
					<p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
						Input
					</p>
					<JsonView value={part.input} />
				</div>
			)}
			{part.state === "output-error" ? (
				<p className="text-destructive">{part.errorText}</p>
			) : part.output != null ? (
				<div>
					<p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
						Result
					</p>
					<JsonView value={part.output} />
				</div>
			) : null}
		</div>
	);
}

type TrailStepData = {
	key: string;
	label: string;
	status: "running" | "error" | "complete";
	statusLabel?: string | null;
	detail?: ReactNode;
};

function TrailStep({ step }: { step: TrailStepData }) {
	const [open, setOpen] = useState(false);
	const hasDetail = step.detail != null;
	return (
		<div>
			<button
				type="button"
				disabled={!hasDetail}
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"flex items-center gap-1.5 py-0.5 text-left text-xs",
					step.status === "error"
						? "text-destructive"
						: "text-muted-foreground",
					hasDetail && "cursor-pointer hover:text-foreground",
				)}
			>
				<span>{step.label}</span>
				{step.statusLabel && (
					<span className="truncate text-muted-foreground/50">
						{step.statusLabel}
					</span>
				)}
				{step.status === "running" && (
					<Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground/60" />
				)}
				{hasDetail && (
					<ChevronRight
						className={cn(
							"size-3 shrink-0 text-muted-foreground/40 transition-transform",
							open && "rotate-90",
						)}
					/>
				)}
			</button>
			{open && hasDetail && (
				<div className="mb-1 mt-1 text-xs text-muted-foreground/80">
					{step.detail}
				</div>
			)}
		</div>
	);
}

// A run of non-direct steps (reasoning + tool calls) on a left rail. Collapsed to
// one line by default; the header shows the live action while running.
function ReasoningTrail({ steps }: { steps: TrailStepData[] }) {
	const [open, setOpen] = useState(false);
	const running = steps.find((s) => s.status === "running");
	const count = `${steps.length} step${steps.length === 1 ? "" : "s"}`;
	return (
		<div className="not-prose my-2">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
			>
				<span>{running ? running.label : count}</span>
				{running?.statusLabel && (
					<span className="truncate text-muted-foreground/50">
						{running.statusLabel}
					</span>
				)}
				{running && (
					<Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground/60" />
				)}
				<ChevronRight
					className={cn(
						"size-3 shrink-0 text-muted-foreground/40 transition-transform",
						open && "rotate-90",
					)}
				/>
			</button>
			{open && (
				<div className="mt-1 ml-1 border-l border-border pl-3">
					{steps.map((step) => (
						<TrailStep key={step.key} step={step} />
					))}
				</div>
			)}
		</div>
	);
}

// Renders an assistant message's parts: direct answer text (Streamdown) outside
// the trail; reasoning + tool calls collapsed into the chain-of-thought trail.
export function AssistantParts({
	parts,
	isStreaming,
	isLatest,
}: {
	parts: Part[];
	isStreaming: boolean;
	isLatest: boolean;
}) {
	const blocks: ReactNode[] = [];
	let trail: TrailStepData[] = [];

	const flushTrail = () => {
		if (trail.length) {
			blocks.push(
				<ReasoningTrail key={`trail-${blocks.length}`} steps={trail} />,
			);
			trail = [];
		}
	};

	const pushTool = (part: AnyToolPart, name: string, i: number) => {
		const presenter = PRESENTERS[name];
		const running =
			part.state === "input-streaming" || part.state === "input-available";
		const error = part.state === "output-error";
		const summary =
			part.state === "output-available" && presenter?.summary
				? presenter.summary(part.input, part.output)
				: null;
		trail.push({
			key: `t-${i}`,
			label: presenter?.label ?? humanize(name),
			status: error ? "error" : running ? "running" : "complete",
			statusLabel: running ? (presenter?.runningLabel ?? "Running…") : summary,
			detail: <ToolDetail part={part} />,
		});
	};

	parts.forEach((part, i) => {
		if (part.type === "text") {
			flushTrail();
			const isLastPart = i === parts.length - 1;
			blocks.push(
				<Streamdown
					// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered parts
					key={i}
					parseIncompleteMarkdown={isStreaming && isLatest && isLastPart}
				>
					{part.text}
				</Streamdown>,
			);
			return;
		}
		if (part.type === "reasoning") {
			if (!part.text) return;
			const isLastPart = i === parts.length - 1;
			trail.push({
				key: `r-${i}`,
				label: "Thinking",
				status: isStreaming && isLatest && isLastPart ? "running" : "complete",
				detail: (
					<p className="whitespace-pre-wrap text-muted-foreground/80">
						{part.text}
					</p>
				),
			});
			return;
		}
		if (part.type === "dynamic-tool") {
			pushTool(part, part.toolName, i);
			return;
		}
		if (isToolUIPart(part)) {
			pushTool(part, getToolName(part), i);
		}
	});

	flushTrail();
	return <>{blocks}</>;
}
