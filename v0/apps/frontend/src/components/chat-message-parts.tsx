import {
	type DynamicToolUIPart,
	getToolName,
	isToolUIPart,
	type ToolUIPart,
	type UIMessage,
} from "ai"
import { ChevronRight, Loader2 } from "lucide-react"
import { type FC, type ReactNode, useState } from "react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { cn } from "@/lib/utils"
import { RequestOpenFileTool } from "./request-open-file-tool"
import { SuggestSignpostTool } from "./suggest-signpost-tool"
import { SuggestTagsTool } from "./suggest-tags-tool"

type Part = UIMessage["parts"][number]

// Actions/context made available to interactive tool presenters (generative UI).
export type ToolContext = {
	provider: string
	apiKey: string
	model: string
	taskId: string
	addToolOutput: (args: {
		tool: string
		toolCallId: string
		output: unknown
	}) => void
	/** Open a source by filename into context (requestOpenFile acceptance). */
	onOpenFile: (filename: string) => void
	/** Set a doc's signpost (suggestSignpost acceptance) — updates local state. */
	onSetSignpost: (filename: string, signpost: string) => void
	/** Merge tags into a doc (suggestTags acceptance) — updates local state. */
	onAddTags: (filename: string, tags: string[]) => void
}

// Tools with bespoke, interactive UI — these render their own card (not the
// generic collapsible) so confirmations and actions are visible, not hidden.
const TOOL_COMPONENTS: Record<
	string,
	FC<{ part: ToolUIPart | DynamicToolUIPart; ctx: ToolContext }>
> = {
	requestOpenFile: RequestOpenFileTool,
	suggestSignpost: SuggestSignpostTool,
	suggestTags: SuggestTagsTool,
}

// ─── Tool presenters (generative UI) ───────────────────────────────────────────
// A presenter turns a tool's raw input/output into something readable. Each tool
// can register an icon and a one-line summary; the collapsed body falls back to
// pretty-printed JSON so nothing is ever hidden from the user.

type ToolPresenter = {
	// Verb shown while the tool is running, e.g. "Searching…"
	runningLabel?: string
	// biome-ignore lint/suspicious/noExplicitAny: tool input/output shapes vary per tool
	summary?: (input: any, output: any) => string | null
}

const PRESENTERS: Record<string, ToolPresenter> = {
	fetchPatent: {
		runningLabel: "Fetching…",
		summary: (input, output) =>
			output?.title ?? input?.publicationNumber ?? null,
	},
}

function humanize(name: string): string {
	const spaced = name.replace(/([A-Z])/g, " $1").trim()
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

function JsonView({ value }: { value: unknown }) {
	if (value == null) return null
	const text =
		typeof value === "string" ? value : JSON.stringify(value, null, 2)
	return (
		<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
			{text}
		</pre>
	)
}

// ─── Reasoning trail ────────────────────────────────────────────────────────────
// Non-direct work (reasoning + tool calls) shown as a vertical trail of steps:
// a connecting line on the left, muted text, each step collapsible (default shut),
// no border/background. The agent's actual answer (text) renders outside this.

function ToolDetail({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
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
	)
}

type TrailStepData = {
	key: string
	label: string
	status: "running" | "error" | "complete"
	statusLabel?: string | null
	detail?: ReactNode
}

function TrailStep({ step }: { step: TrailStepData }) {
	const [open, setOpen] = useState(false)
	const hasDetail = step.detail != null
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
	)
}

// A run of non-direct steps, collapsed into one line by default. The header
// shows live progress while running (current action + spinner) and a quiet
// summary when done; expanding reveals the steps grouped by a left rail (each
// still expandable for its own detail).
function ReasoningTrail({ steps }: { steps: TrailStepData[] }) {
	const [open, setOpen] = useState(false)
	// A single step needs no outer group — render it directly.
	if (steps.length === 1) {
		return (
			<div className="not-prose my-2">
				<TrailStep step={steps[0]} />
			</div>
		)
	}
	const running = steps.find((s) => s.status === "running")
	const summary = `${steps.length} steps`
	return (
		<div className="not-prose my-2">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
			>
				<span>{running ? running.label : summary}</span>
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
	)
}

// ─── Assistant parts ────────────────────────────────────────────────────────────

export function AssistantParts({
	parts,
	isStreaming,
	isLatest,
	ctx,
}: {
	parts: Part[]
	isStreaming: boolean
	isLatest: boolean
	ctx: ToolContext
}) {
	const blocks: ReactNode[] = []
	let trail: TrailStepData[] = []

	const flushTrail = () => {
		if (trail.length) {
			blocks.push(
				<ReasoningTrail key={`trail-${blocks.length}`} steps={trail} />,
			)
			trail = []
		}
	}

	const pushToolStep = (
		part: ToolUIPart | DynamicToolUIPart,
		name: string,
		i: number,
	) => {
		const Custom = TOOL_COMPONENTS[name]
		if (Custom) {
			// Interactive tools (e.g. extractSource confirmation) must stay visible.
			flushTrail()
			blocks.push(<Custom key={i} part={part} ctx={ctx} />)
			return
		}
		const presenter = PRESENTERS[name]
		const running =
			part.state === "input-streaming" || part.state === "input-available"
		const error = part.state === "output-error"
		const summary =
			part.state === "output-available" && presenter?.summary
				? presenter.summary(part.input, part.output)
				: null
		trail.push({
			key: `t-${i}`,
			label: humanize(name),
			status: error ? "error" : running ? "running" : "complete",
			statusLabel: running ? (presenter?.runningLabel ?? "Running…") : summary,
			detail: <ToolDetail part={part} />,
		})
	}

	parts.forEach((part, i) => {
		if (part.type === "text") {
			flushTrail()
			const isLastPart = i === parts.length - 1
			blocks.push(
				<Streamdown
					// biome-ignore lint/suspicious/noArrayIndexKey: parts are a stable ordered array
					key={i}
					isAnimating={isStreaming && isLatest && isLastPart}
				>
					{part.text}
				</Streamdown>,
			)
			return
		}

		if (part.type === "reasoning") {
			if (!part.text) return
			const isLastPart = i === parts.length - 1
			trail.push({
				key: `r-${i}`,
				label: "Thinking",
				status: isStreaming && isLatest && isLastPart ? "running" : "complete",
				detail: (
					<p className="whitespace-pre-wrap text-muted-foreground/80">
						{part.text}
					</p>
				),
			})
			return
		}

		if (part.type === "dynamic-tool") {
			pushToolStep(part, part.toolName, i)
			return
		}

		if (isToolUIPart(part)) {
			pushToolStep(part, getToolName(part), i)
		}
	})

	flushTrail()

	return <>{blocks}</>
}
