import {
	type DynamicToolUIPart,
	getToolName,
	isToolUIPart,
	type ToolUIPart,
	type UIMessage,
} from "ai"
import {
	AlertCircle,
	Brain,
	Check,
	ChevronRight,
	FileText,
	FolderTree,
	Globe,
	Loader2,
	type LucideIcon,
	Wrench,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { cn } from "@/lib/utils"

type Part = UIMessage["parts"][number]

// ─── Tool presenters (generative UI) ───────────────────────────────────────────
// A presenter turns a tool's raw input/output into something readable. Each tool
// can register an icon and a one-line summary; the collapsed body falls back to
// pretty-printed JSON so nothing is ever hidden from the user.

type ToolPresenter = {
	icon: LucideIcon
	// biome-ignore lint/suspicious/noExplicitAny: tool input/output shapes vary per tool
	summary?: (input: any, output: any) => string | null
}

const PRESENTERS: Record<string, ToolPresenter> = {
	listDirectory: {
		icon: FolderTree,
		summary: (_input, output) =>
			Array.isArray(output) ? `${output.length} items` : null,
	},
	readFile: {
		icon: FileText,
		summary: (input, output) => {
			if (output?.note) return "PDF (open in editor for context)"
			if (typeof output?.content === "string")
				return `${output.content.length} chars`
			return input?.path?.split("/").at(-1) ?? null
		},
	},
	fetchPatent: {
		icon: Globe,
		summary: (input, output) =>
			output?.title ?? input?.publicationNumber ?? null,
	},
}

function humanize(name: string): string {
	const spaced = name.replace(/([A-Z])/g, " $1").trim()
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

// ─── Shared collapsible ─────────────────────────────────────────────────────────

function Collapsible({
	icon: Icon,
	title,
	summary,
	status,
	defaultOpen = false,
	children,
}: {
	icon: LucideIcon
	title: string
	summary?: string | null
	status?: ReactNode
	defaultOpen?: boolean
	children: ReactNode
}) {
	const [open, setOpen] = useState(defaultOpen)
	return (
		<div className="not-prose my-2 rounded-md border bg-muted/30 text-xs">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
			>
				<ChevronRight
					className={cn(
						"size-3 shrink-0 text-muted-foreground/60 transition-transform",
						open && "rotate-90",
					)}
				/>
				<Icon className="size-3 shrink-0 text-muted-foreground" />
				<span className="font-medium text-foreground">{title}</span>
				{summary && (
					<span className="truncate text-muted-foreground">· {summary}</span>
				)}
				{status && <span className="ml-auto shrink-0">{status}</span>}
			</button>
			{open && <div className="border-t px-2.5 py-2">{children}</div>}
		</div>
	)
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

// ─── Tool part ──────────────────────────────────────────────────────────────────

function ToolPart({
	part,
	name,
}: {
	part: ToolUIPart | DynamicToolUIPart
	name: string
}) {
	const presenter = PRESENTERS[name]
	const Icon = presenter?.icon ?? Wrench
	const running =
		part.state === "input-streaming" || part.state === "input-available"
	const error = part.state === "output-error"
	const summary =
		part.state === "output-available" && presenter?.summary
			? presenter.summary(part.input, part.output)
			: running
				? "running…"
				: null

	const status = running ? (
		<Loader2 className="size-3 animate-spin text-muted-foreground" />
	) : error ? (
		<AlertCircle className="size-3 text-destructive" />
	) : (
		<Check className="size-3 text-green-600" />
	)

	return (
		<Collapsible
			icon={Icon}
			title={humanize(name)}
			summary={summary}
			status={status}
		>
			<div className="space-y-2">
				{part.input != null && (
					<div>
						<p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
							Input
						</p>
						<JsonView value={part.input} />
					</div>
				)}
				{error ? (
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
		</Collapsible>
	)
}

// ─── Assistant parts ────────────────────────────────────────────────────────────

export function AssistantParts({
	parts,
	isStreaming,
	isLatest,
}: {
	parts: Part[]
	isStreaming: boolean
	isLatest: boolean
}) {
	return (
		<>
			{parts.map((part, i) => {
				if (part.type === "text") {
					const isLastPart = i === parts.length - 1
					return (
						<Streamdown
							// biome-ignore lint/suspicious/noArrayIndexKey: parts are a stable ordered array
							key={i}
							isAnimating={isStreaming && isLatest && isLastPart}
						>
							{part.text}
						</Streamdown>
					)
				}

				if (part.type === "reasoning") {
					if (!part.text) return null
					return (
						<Collapsible
							// biome-ignore lint/suspicious/noArrayIndexKey: parts are a stable ordered array
							key={i}
							icon={Brain}
							title="Reasoning"
						>
							<p className="whitespace-pre-wrap text-muted-foreground/80">
								{part.text}
							</p>
						</Collapsible>
					)
				}

				if (part.type === "dynamic-tool") {
					return (
						<ToolPart
							// biome-ignore lint/suspicious/noArrayIndexKey: parts are a stable ordered array
							key={i}
							part={part}
							name={part.toolName}
						/>
					)
				}

				if (isToolUIPart(part)) {
					const name = getToolName(part)
					// generateMetadata is internal UI scaffolding (consumed by ExchangePanel)
					if (name === "generateMetadata") return null
					return (
						<ToolPart
							// biome-ignore lint/suspicious/noArrayIndexKey: parts are a stable ordered array
							key={i}
							part={part}
							name={name}
						/>
					)
				}

				return null
			})}
		</>
	)
}
