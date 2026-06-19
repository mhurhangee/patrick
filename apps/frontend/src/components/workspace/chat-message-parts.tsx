import type { FindLawResult, LookupResult } from "@patrick/shared";
import {
	type DynamicToolUIPart,
	getToolName,
	isToolUIPart,
	type ToolUIPart,
	type UIMessage,
} from "ai";
import {
	ChevronRight,
	ClipboardList,
	Code,
	FilePen,
	FilePlus,
	FileSearch,
	FolderOpen,
	Tag,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Streamdown } from "streamdown";
import { Patrick } from "@/components/patrick";
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
	ep_law_lookup: {
		label: "Recall EPC law",
		runningLabel: "Looking up EPC law…",
		summary: (input) =>
			Array.isArray(input?.refs) ? input.refs.join(", ") : null,
	},
	find_law: {
		label: "Find relevant law",
		runningLabel: "Searching the contents…",
		summary: (input) => input?.query ?? null,
	},
	web_search: {
		label: "Search the web",
		runningLabel: "Searching the web…",
		summary: (input) => input?.query ?? null,
	},
	google_search: {
		label: "Search the web",
		runningLabel: "Searching the web…",
		summary: (input) => input?.query ?? null,
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

// A verbatim provision, displayed proudly: title + in-force stamp, the current
// text (the focused paragraph accented), and its footnotes / decision pointers.
function ProvisionCard({ result }: { result: LookupResult }) {
	if (result.status !== "ok" || !result.provision)
		return (
			<p className="text-xs text-muted-foreground">
				No EPC provision found for “{result.ref}”.
			</p>
		);
	const p = result.provision;
	const notes = Object.entries(p.notes);
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-3">
				<h4 className="font-heading text-sm font-semibold text-foreground">
					{p.title ?? p.citationKey}
					{p.titleNotes.length > 0 && (
						<sup className="ml-0.5 text-[9px] font-normal text-muted-foreground">
							{p.titleNotes.join(",")}
						</sup>
					)}
				</h4>
				<span className="shrink-0 text-[10px] text-muted-foreground">
					{p.version}
				</span>
			</div>
			<div className="space-y-1 text-xs leading-relaxed text-foreground/90">
				{p.blocks.map((b, i) => {
					const focused = !!result.focus && b.text.startsWith(result.focus);
					return (
						<p
							// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered blocks
							key={i}
							className={
								focused ? "border-l-2 border-emerald-500/60 pl-2" : undefined
							}
						>
							{b.text}
							{b.notes && b.notes.length > 0 && (
								<sup className="ml-0.5 text-[9px] text-muted-foreground">
									{b.notes.join(",")}
								</sup>
							)}
						</p>
					);
				})}
			</div>
			{notes.length > 0 && (
				<div className="space-y-0.5 border-t pt-1.5">
					{notes.map(([n, text]) => (
						<p key={n} className="text-[10px] text-muted-foreground">
							<sup>{n}</sup> {text}
						</p>
					))}
				</div>
			)}
		</div>
	);
}

function LawResults({ output }: { output: unknown }) {
	const results = (output as { results?: LookupResult[] })?.results;
	if (!Array.isArray(results)) return <JsonView value={output} />;
	return (
		<div className="space-y-3">
			{results.map((r, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered results
				<ProvisionCard key={i} result={r} />
			))}
		</div>
	);
}

// Web sources the agent's search used — shown as-is (no filtering would be
// deceptive), flagged "web, verify", as a citations block on the answer. Google
// returns opaque redirect URLs with the real domain in the title.
type SourceUrlPart = { type: "source-url"; url: string; title?: string };

function domainOf(url: string, title?: string): string {
	try {
		const host = new URL(url).hostname.replace(/^www\./, "");
		if (host === "vertexaisearch.cloud.google.com")
			return (title ?? "?").toLowerCase();
		return host;
	} catch {
		return (title ?? url).toLowerCase();
	}
}

function SourcesBlock({ sources }: { sources: SourceUrlPart[] }) {
	const seen = new Set<string>();
	const rows: SourceUrlPart[] = [];
	for (const s of sources) {
		if (!s.url) continue;
		// Google emits several distinct opaque redirect URLs for the same page, so
		// dedupe those by title (its domain); keep other vendors' real URLs distinct.
		let key = s.url;
		try {
			if (new URL(s.url).hostname === "vertexaisearch.cloud.google.com")
				key = `g:${(s.title ?? s.url).toLowerCase()}`;
		} catch {}
		if (!seen.has(key)) {
			seen.add(key);
			rows.push(s);
		}
	}
	if (rows.length === 0) return null;
	return (
		<div className="space-y-0.5 rounded-md border bg-muted/30 p-2 text-xs">
			<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
				Sources — web, verify against the original
			</p>
			{rows.map((s) => {
				const domain = domainOf(s.url, s.title);
				// Google's source title IS the domain (no page title) — don't repeat it.
				const label =
					s.title && s.title.toLowerCase() !== domain ? s.title : null;
				return (
					<a
						key={s.url}
						href={s.url}
						target="_blank"
						rel="noreferrer"
						title={s.url}
						className="block truncate text-emerald-700 hover:underline dark:text-emerald-400"
					>
						<span className="text-muted-foreground">{domain}</span>
						{label && ` ${label}`}
					</a>
				);
			})}
		</div>
	);
}

// Sections find_law surfaced from a body's contents — the agent grounds these
// verbatim via ep_law_lookup; shown for transparency.
function FindLawCard({ output }: { output: unknown }) {
	const r = output as Partial<FindLawResult> | null;
	if (!r || !Array.isArray(r.sections)) return <JsonView value={output} />;
	if (r.error)
		return <p className="text-xs text-muted-foreground">find_law: {r.error}</p>;
	if (r.sections.length === 0)
		return (
			<p className="text-xs text-muted-foreground">
				No relevant sections found.
			</p>
		);
	return (
		<div className="space-y-0.5 text-xs">
			{r.sections.map((s) => (
				<p key={s.ref}>
					<span className="font-medium text-foreground">{s.ref}</span>
					{s.title ? ` — ${s.title}` : ""}
				</p>
			))}
		</div>
	);
}

// Tools whose output gets a bespoke renderer instead of the raw JSON view. Add the
// next rich tool here rather than growing a chain of conditionals in ToolDetail.
const OUTPUT_RENDERERS: Record<string, (output: unknown) => ReactNode> = {
	ep_law_lookup: (output) => <LawResults output={output} />,
	find_law: (output) => <FindLawCard output={output} />,
};

function ToolDetail({ part }: { part: AnyToolPart }) {
	const renderer = OUTPUT_RENDERERS[getToolName(part)];
	return (
		<div className="space-y-2">
			{part.input != null && !renderer && (
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
				renderer ? (
					renderer(part.output)
				) : (
					<div>
						<p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
							Result
						</p>
						<JsonView value={part.output} />
					</div>
				)
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
				{step.status === "running" && (
					<Patrick variant="scanning" size={12} className="shrink-0" />
				)}
				<span>{step.label}</span>
				{step.statusLabel && (
					<span className="truncate text-muted-foreground/50">
						{step.statusLabel}
					</span>
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
				{running && (
					<Patrick variant="scanning" size={12} className="shrink-0" />
				)}
				<span>{running ? running.label : count}</span>
				{running?.statusLabel && (
					<span className="truncate text-muted-foreground/50">
						{running.statusLabel}
					</span>
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
	/** Apply a label (+ generated chat suggestions) to a document (suggestLabel acceptance). */
	setLabel: (filename: string, label: string, suggestions?: string[]) => void;
	/** Create a blank draft + open it; resolves to its filename (createDraft). */
	createDraft: (name: string) => Promise<string | null>;
	/** Make an editable copy of an original + open it (requestUnlock). */
	unlockSource: (filename: string) => Promise<string | null>;
	/** Apply a proposed task brief — replace it, or append a note (suggestBrief acceptance). */
	suggestBrief: (brief: string, append?: boolean) => void;
	/** Apply a proposed Patrick prompt — one section if `heading` is set, else the whole prompt (suggestPrompt acceptance). */
	suggestPrompt: (heading: string | undefined, content: string) => void;
	/** Fetch an EP/WO publication's full text from EPO OPS → saved document (fetchPublication acceptance). */
	fetchPublication: (number: string) => Promise<{
		saved: boolean;
		filename?: string;
		summary?: string;
		error?: string;
	}>;
};

type HitlInput = Record<string, string | undefined>;
type HitlOutput = Record<string, unknown>;

const bold = (s: unknown) => (
	<span className="font-medium">{String(s ?? "")}</span>
);
const iconCls = "shrink-0 text-muted-foreground";

// One spec per HITL tool: the proposal view, what accepting does (its side-effect
// + the tool output to record), and how the resolved state reads. The generic
// HitlToolCard renders any of them.
type HitlSpec = {
	icon: ReactNode;
	title: (i: HitlInput) => ReactNode;
	detail?: (i: HitlInput) => ReactNode;
	acceptLabel: string;
	rejectLabel: string;
	accept: (i: HitlInput, h: ToolUiHandlers) => unknown | Promise<unknown>;
	reject: (i: HitlInput) => unknown;
	resolved: (o: HitlOutput) => ReactNode;
	preparing?: string;
};

const HITL_SPECS: Record<string, HitlSpec> = {
	requestOpenFile: {
		icon: <FolderOpen size={13} className={iconCls} />,
		title: (i) => <>Patrick wants to add {bold(i.filename)} to this chat.</>,
		detail: () => (
			<span className="text-muted-foreground">
				Its full content joins the context from the next message.
			</span>
		),
		acceptLabel: "Pin it",
		rejectLabel: "Not now",
		accept: (i, h) => {
			if (i.filename) h.pinSource(i.filename);
			return { pinned: true, filename: i.filename };
		},
		reject: (i) => ({ pinned: false, filename: i.filename }),
		resolved: (o) =>
			o.pinned ? (
				<>Pinned {bold(o.filename)} — now in context.</>
			) : (
				<>Left {bold(o.filename)} out.</>
			),
		preparing: "Preparing request…",
	},
	suggestLabel: {
		icon: <Tag size={13} className={iconCls} />,
		title: (i) => <>Label {bold(i.filename)} as:</>,
		detail: (i) => {
			const n = Array.isArray((i as Record<string, unknown>).suggestions)
				? ((i as Record<string, unknown>).suggestions as unknown[]).length
				: 0;
			return (
				<span className="text-foreground italic">
					“{i.label}”
					{n > 0 && (
						<span className="text-muted-foreground not-italic">
							{" "}
							· +{n} quick prompts
						</span>
					)}
				</span>
			);
		},
		acceptLabel: "Apply",
		rejectLabel: "No",
		accept: (i, h) => {
			const raw = (i as Record<string, unknown>).suggestions;
			const suggestions = Array.isArray(raw)
				? raw.filter((s): s is string => typeof s === "string")
				: undefined;
			if (i.filename && i.label) h.setLabel(i.filename, i.label, suggestions);
			return { applied: true, filename: i.filename, label: i.label };
		},
		reject: (i) => ({ applied: false, filename: i.filename }),
		resolved: (o) =>
			o.applied ? (
				<>
					Labeled {bold(o.filename)} — “{String(o.label ?? "")}”.
				</>
			) : (
				<>Left {bold(o.filename)} unlabeled.</>
			),
	},
	createDraft: {
		icon: <FilePlus size={13} className={iconCls} />,
		title: (i) => <>Start a new draft: {bold(i.name)}?</>,
		acceptLabel: "Create",
		rejectLabel: "No",
		accept: async (i, h) => {
			const filename = await h.createDraft(i.name ?? "Draft");
			return filename ? { created: true, filename } : { created: false };
		},
		reject: () => ({ created: false }),
		resolved: (o) =>
			o.created ? (
				<>Created {bold(o.filename)} — now your active draft.</>
			) : (
				<>No draft created.</>
			),
	},
	requestUnlock: {
		icon: <FilePen size={13} className={iconCls} />,
		title: (i) => <>Make an editable copy of {bold(i.filename)} to draft in?</>,
		acceptLabel: "Create copy",
		rejectLabel: "No",
		accept: async (i, h) => {
			const filename = i.filename ? await h.unlockSource(i.filename) : null;
			return filename ? { unlocked: true, filename } : { unlocked: false };
		},
		reject: () => ({ unlocked: false }),
		resolved: (o) =>
			o.unlocked ? (
				<>Created editable copy {bold(o.filename)}.</>
			) : (
				<>Left it as-is.</>
			),
	},
	fetchPublication: {
		icon: <FileSearch size={13} className={iconCls} />,
		title: (i) => <>Request {bold(i.number)} from EPO OPS?</>,
		detail: () => (
			<span className="text-muted-foreground">
				Fetches the full text (claims + description) and saves it to this
				matter.
			</span>
		),
		acceptLabel: "Request",
		rejectLabel: "No",
		accept: async (i, h) =>
			i.number ? h.fetchPublication(i.number) : { saved: false },
		reject: () => ({ saved: false }),
		resolved: (o) =>
			o.saved ? (
				<>Saved {bold(o.filename)} — pinned, now in context.</>
			) : o.error ? (
				<>Couldn’t fetch it: {String(o.error)}</>
			) : (
				<>No document fetched.</>
			),
		preparing: "Requesting from EPO OPS…",
	},
	suggestBrief: {
		icon: <ClipboardList size={13} className={iconCls} />,
		title: (i) =>
			i.append ? <>Add to the task brief:</> : <>Set the task brief to:</>,
		detail: (i) => (
			<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] not-italic text-foreground">
				{i.brief}
			</pre>
		),
		acceptLabel: "Apply",
		rejectLabel: "No",
		accept: (i, h) => {
			if (i.brief) h.suggestBrief(i.brief, !!i.append);
			return { applied: !!i.brief };
		},
		reject: () => ({ applied: false }),
		resolved: (o) => (o.applied ? "Brief updated." : "Brief unchanged."),
	},
	suggestPrompt: {
		icon: <Code size={13} className={iconCls} />,
		title: (i) =>
			i.heading ? (
				<>Set your “{i.heading}” section to:</>
			) : (
				<>Rewrite your whole Patrick prompt to:</>
			),
		detail: (i) => (
			<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[11px] not-italic text-foreground">
				{i.content ?? i.prompt}
			</pre>
		),
		acceptLabel: "Apply",
		rejectLabel: "No",
		accept: (i, h) => {
			const content = i.content ?? i.prompt;
			if (content) h.suggestPrompt(i.heading, content);
			return { applied: !!content };
		},
		reject: () => ({ applied: false }),
		resolved: (o) => (o.applied ? "Prompt updated." : "Left unchanged."),
	},
};

/** Tool names handled by a HITL card (so the client doesn't auto-resolve them). */
export const HITL_TOOLS = new Set(Object.keys(HITL_SPECS));

function HitlCard({ children }: { children: ReactNode }) {
	return (
		<div className="not-prose my-2 rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
			{children}
		</div>
	);
}

// One card for every HITL tool, driven by its spec. accept/reject ALWAYS resolve
// the tool call (a thrown side-effect becomes an error output) so the agent loop
// can never hang waiting on an unresolved call.
function HitlToolCard({
	name,
	part,
	handlers,
	spec,
}: {
	name: string;
	part: AnyToolPart;
	handlers: ToolUiHandlers;
	spec: HitlSpec;
}) {
	const input = (part.input ?? {}) as HitlInput;

	const respond = async (accept: boolean) => {
		let output: unknown;
		try {
			output = accept ? await spec.accept(input, handlers) : spec.reject(input);
		} catch (err) {
			output = { error: err instanceof Error ? err.message : "action failed" };
		}
		handlers.addToolResult({ tool: name, toolCallId: part.toolCallId, output });
	};

	if (part.state === "output-available")
		return (
			<HitlCard>
				<span className="text-muted-foreground">
					{spec.resolved((part.output ?? {}) as HitlOutput)}
				</span>
			</HitlCard>
		);
	if (part.state === "output-error")
		return (
			<HitlCard>
				<span className="text-destructive">
					{part.errorText ?? "Something went wrong."}
				</span>
			</HitlCard>
		);
	if (part.state === "input-streaming")
		return (
			<HitlCard>
				<span className="text-muted-foreground">
					{spec.preparing ?? "Preparing…"}
				</span>
			</HitlCard>
		);

	return (
		<HitlCard>
			<div className="flex items-center gap-2">
				{spec.icon}
				<span className="text-foreground">{spec.title(input)}</span>
			</div>
			{spec.detail && <div className="mt-1 pl-5">{spec.detail(input)}</div>}
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="sm" className="h-7" onClick={() => respond(true)}>
					{spec.acceptLabel}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="h-7"
					onClick={() => respond(false)}
				>
					{spec.rejectLabel}
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
	const sources: SourceUrlPart[] = [];

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
		const spec = HITL_SPECS[name];
		if (spec && handlers) {
			flushTrail();
			blocks.push(
				<HitlToolCard
					key={`hitl-${i}`}
					name={name}
					part={part}
					handlers={handlers}
					spec={spec}
				/>,
			);
			return;
		}
		const presenter = PRESENTERS[name];
		const running =
			part.state === "input-streaming" || part.state === "input-available";
		// Editor tools report failure as a {success:false} output (not an
		// output-error part) — treat that as an error so a failed edit shows red
		// instead of looking complete.
		const out = part.output as
			| { success?: boolean; error?: string }
			| undefined;
		const failed = part.state === "output-error" || out?.success === false;
		const summary =
			part.state === "output-available" && !failed && presenter?.summary
				? presenter.summary(part.input, part.output)
				: null;
		trail.push({
			key: `t-${i}`,
			label: presenter?.label ?? humanize(name),
			status: failed ? "error" : running ? "running" : "complete",
			statusLabel: running
				? (presenter?.runningLabel ?? "Running…")
				: failed
					? (out?.error ?? "failed")
					: summary,
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
		if (part.type === "source-url") {
			sources.push(part);
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
	if (sources.length > 0)
		blocks.push(<SourcesBlock key="sources" sources={sources} />);
	return <>{blocks}</>;
}
