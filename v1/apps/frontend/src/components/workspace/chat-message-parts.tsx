import {
	type DynamicToolUIPart,
	getToolName,
	isToolUIPart,
	type ToolUIPart,
	type UIMessage,
} from "ai";
import {
	ChevronRight,
	FilePen,
	FilePlus,
	FolderOpen,
	Loader2,
	Tag,
} from "lucide-react";
import { type FC, type ReactNode, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
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

// ─── Human-in-the-loop tools ────────────────────────────────────────────────────
// HITL tools (no auto-execute) render an interactive card and resolve only when
// the attorney accepts/rejects. Add a tool name here + a card below to extend.

export type ToolUiHandlers = {
	addToolResult: (args: {
		tool: string;
		toolCallId: string;
		output: unknown;
	}) => void;
	/** Pin a source into the chat's context (requestOpenFile acceptance). */
	pinSource: (filename: string) => void;
	/** Apply a label to a document (suggestLabel acceptance). */
	setLabel: (filename: string, label: string) => void;
	/** Create a blank draft + open it; resolves to its filename (createDraft). */
	createDraft: (name: string) => Promise<string | null>;
	/** Make an editable copy of an original + open it (requestUnlock). */
	unlockSource: (filename: string) => Promise<string | null>;
};

const HITL_CARDS: Record<
	string,
	FC<{ part: AnyToolPart; handlers: ToolUiHandlers }>
> = {
	requestOpenFile: RequestOpenFileCard,
	suggestLabel: SuggestLabelCard,
	createDraft: CreateDraftCard,
	requestUnlock: RequestUnlockCard,
};

/** Tool names handled by a HITL card (so the client doesn't auto-resolve them). */
export const HITL_TOOLS = new Set(Object.keys(HITL_CARDS));

function HitlCard({ children }: { children: ReactNode }) {
	return (
		<div className="not-prose my-2 rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
			{children}
		</div>
	);
}

// Patrick proposes pinning a source; the attorney decides. The agent can only
// suggest — accepting is what puts a doc in context (OPEN = CONTEXT honesty).
function RequestOpenFileCard({
	part,
	handlers,
}: {
	part: AnyToolPart;
	handlers: ToolUiHandlers;
}) {
	const filename =
		(part.input as { filename?: string } | undefined)?.filename ?? "a document";

	const respond = (pinned: boolean) => {
		if (pinned) handlers.pinSource(filename);
		handlers.addToolResult({
			tool: "requestOpenFile",
			toolCallId: part.toolCallId,
			output: { pinned, filename },
		});
	};

	if (part.state === "output-available") {
		const out = part.output as { pinned?: boolean } | undefined;
		return (
			<HitlCard>
				<span className="text-muted-foreground">
					{out?.pinned ? (
						<>
							Pinned <span className="font-medium">{filename}</span> — now in
							context.
						</>
					) : (
						<>
							Left <span className="font-medium">{filename}</span> out.
						</>
					)}
				</span>
			</HitlCard>
		);
	}
	if (part.state === "output-error")
		return (
			<HitlCard>
				<span className="text-destructive">
					{part.errorText ?? "Couldn't add the document."}
				</span>
			</HitlCard>
		);
	if (part.state === "input-streaming")
		return (
			<HitlCard>
				<span className="text-muted-foreground">Preparing request…</span>
			</HitlCard>
		);

	return (
		<HitlCard>
			<div className="flex items-center gap-2">
				<FolderOpen size={13} className="shrink-0 text-muted-foreground" />
				<span className="text-foreground">
					Patrick wants to add <span className="font-medium">{filename}</span>{" "}
					to this chat.
				</span>
			</div>
			<p className="mt-1 pl-5 text-muted-foreground">
				Its full content joins the context from the next message.
			</p>
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="sm" className="h-7" onClick={() => respond(true)}>
					Pin it
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="h-7"
					onClick={() => respond(false)}
				>
					Not now
				</Button>
			</div>
		</HitlCard>
	);
}

// Patrick proposes a label for a document; the attorney applies or declines.
function SuggestLabelCard({
	part,
	handlers,
}: {
	part: AnyToolPart;
	handlers: ToolUiHandlers;
}) {
	const input = part.input as { filename?: string; label?: string } | undefined;
	const filename = input?.filename ?? "a document";
	const label = input?.label ?? "";

	const respond = (apply: boolean) => {
		if (apply && label) handlers.setLabel(filename, label);
		handlers.addToolResult({
			tool: "suggestLabel",
			toolCallId: part.toolCallId,
			output: { applied: apply, filename, label },
		});
	};

	if (part.state === "output-available") {
		const out = part.output as { applied?: boolean } | undefined;
		return (
			<HitlCard>
				<span className="text-muted-foreground">
					{out?.applied ? (
						<>
							Labeled <span className="font-medium">{filename}</span> — “{label}
							”.
						</>
					) : (
						<>
							Left <span className="font-medium">{filename}</span> unlabeled.
						</>
					)}
				</span>
			</HitlCard>
		);
	}
	if (part.state === "input-streaming")
		return (
			<HitlCard>
				<span className="text-muted-foreground">Preparing suggestion…</span>
			</HitlCard>
		);

	return (
		<HitlCard>
			<div className="flex items-center gap-2">
				<Tag size={13} className="shrink-0 text-muted-foreground" />
				<span className="text-foreground">
					Label <span className="font-medium">{filename}</span> as:
				</span>
			</div>
			<p className="mt-1 pl-5 text-foreground italic">“{label}”</p>
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="sm" className="h-7" onClick={() => respond(true)}>
					Apply
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="h-7"
					onClick={() => respond(false)}
				>
					No
				</Button>
			</div>
		</HitlCard>
	);
}

// Patrick proposes starting a new draft; the attorney creates or declines.
function CreateDraftCard({
	part,
	handlers,
}: {
	part: AnyToolPart;
	handlers: ToolUiHandlers;
}) {
	const name = (part.input as { name?: string } | undefined)?.name ?? "a draft";

	const accept = async () => {
		const filename = await handlers.createDraft(name);
		handlers.addToolResult({
			tool: "createDraft",
			toolCallId: part.toolCallId,
			output: filename ? { created: true, filename } : { created: false },
		});
	};
	const reject = () =>
		handlers.addToolResult({
			tool: "createDraft",
			toolCallId: part.toolCallId,
			output: { created: false },
		});

	if (part.state === "output-available") {
		const out = part.output as
			| { created?: boolean; filename?: string }
			| undefined;
		return (
			<HitlCard>
				<span className="text-muted-foreground">
					{out?.created ? (
						<>
							Created <span className="font-medium">{out.filename}</span> — now
							your active draft.
						</>
					) : (
						<>No draft created.</>
					)}
				</span>
			</HitlCard>
		);
	}
	if (part.state === "input-streaming")
		return (
			<HitlCard>
				<span className="text-muted-foreground">Preparing…</span>
			</HitlCard>
		);

	return (
		<HitlCard>
			<div className="flex items-center gap-2">
				<FilePlus size={13} className="shrink-0 text-muted-foreground" />
				<span className="text-foreground">
					Start a new draft: <span className="font-medium">{name}</span>?
				</span>
			</div>
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="sm" className="h-7" onClick={accept}>
					Create
				</Button>
				<Button size="sm" variant="ghost" className="h-7" onClick={reject}>
					No
				</Button>
			</div>
		</HitlCard>
	);
}

// Patrick proposes making an editable copy of an original to draft amendments in.
function RequestUnlockCard({
	part,
	handlers,
}: {
	part: AnyToolPart;
	handlers: ToolUiHandlers;
}) {
	const filename =
		(part.input as { filename?: string } | undefined)?.filename ?? "a document";

	const accept = async () => {
		const copy = await handlers.unlockSource(filename);
		handlers.addToolResult({
			tool: "requestUnlock",
			toolCallId: part.toolCallId,
			output: copy ? { unlocked: true, filename: copy } : { unlocked: false },
		});
	};
	const reject = () =>
		handlers.addToolResult({
			tool: "requestUnlock",
			toolCallId: part.toolCallId,
			output: { unlocked: false },
		});

	if (part.state === "output-available") {
		const out = part.output as
			| { unlocked?: boolean; filename?: string }
			| undefined;
		return (
			<HitlCard>
				<span className="text-muted-foreground">
					{out?.unlocked ? (
						<>
							Created editable copy{" "}
							<span className="font-medium">{out.filename}</span>.
						</>
					) : (
						<>
							Left <span className="font-medium">{filename}</span> as-is.
						</>
					)}
				</span>
			</HitlCard>
		);
	}
	if (part.state === "input-streaming")
		return (
			<HitlCard>
				<span className="text-muted-foreground">Preparing…</span>
			</HitlCard>
		);

	return (
		<HitlCard>
			<div className="flex items-center gap-2">
				<FilePen size={13} className="shrink-0 text-muted-foreground" />
				<span className="text-foreground">
					Make an editable copy of{" "}
					<span className="font-medium">{filename}</span> to draft in?
				</span>
			</div>
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="sm" className="h-7" onClick={accept}>
					Create copy
				</Button>
				<Button size="sm" variant="ghost" className="h-7" onClick={reject}>
					No
				</Button>
			</div>
		</HitlCard>
	);
}

// Renders an assistant message's parts: direct answer text (Streamdown) outside
// the trail; reasoning + tool calls collapsed into the chain-of-thought trail;
// HITL tools as interactive cards.
export function AssistantParts({
	parts,
	isStreaming,
	isLatest,
	handlers,
}: {
	parts: Part[];
	isStreaming: boolean;
	isLatest: boolean;
	handlers?: ToolUiHandlers;
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
		// HITL tools render an interactive card outside the trail.
		const Card = HITL_CARDS[name];
		if (Card && handlers) {
			flushTrail();
			blocks.push(<Card key={`hitl-${i}`} part={part} handlers={handlers} />);
			return;
		}
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
