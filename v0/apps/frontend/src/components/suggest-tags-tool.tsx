import type { DynamicToolUIPart, ToolUIPart } from "ai"
import { Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ToolContext } from "./chat-message-parts"

// Generative UI for the suggestTags tool — a human-in-the-loop confirm card. The
// agent proposes triage tags for a source; on accept they're merged (union) into
// the doc's tags via shared asset state, updating the open tab live.

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div className="not-prose my-2 rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
			{children}
		</div>
	)
}

export function SuggestTagsTool({
	part,
	ctx,
}: {
	part: ToolUIPart | DynamicToolUIPart
	ctx: ToolContext
}) {
	const input = part.input as { filename?: string; tags?: string[] } | undefined
	const filename = input?.filename ?? "this document"
	const tags = (input?.tags ?? [])
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean)

	function accept() {
		ctx.onAddTags(filename, tags)
		ctx.addToolOutput({
			tool: "suggestTags",
			toolCallId: part.toolCallId,
			output: { saved: true, filename, tags },
		})
	}

	function reject() {
		ctx.addToolOutput({
			tool: "suggestTags",
			toolCallId: part.toolCallId,
			output: { saved: false, filename },
		})
	}

	if (part.state === "output-available") {
		const output = part.output as { saved?: boolean } | undefined
		return (
			<Card>
				<span className="text-muted-foreground">
					{output?.saved ? (
						<>
							Tagged <span className="font-medium">{filename}</span>.
						</>
					) : (
						<>
							Left <span className="font-medium">{filename}</span> untagged.
						</>
					)}
				</span>
			</Card>
		)
	}

	if (part.state === "output-error") {
		return (
			<Card>
				<span className="text-destructive">
					{part.errorText ?? "Could not save tags."}
				</span>
			</Card>
		)
	}

	if (part.state === "input-streaming") {
		return (
			<Card>
				<span className="text-muted-foreground">Preparing tags…</span>
			</Card>
		)
	}

	return (
		<Card>
			<div className="flex items-center gap-2">
				<Tag size={13} className="shrink-0 text-muted-foreground" />
				<span className="text-foreground">
					Tag <span className="font-medium">{filename}</span>?
				</span>
			</div>
			<div className="mt-1 flex flex-wrap gap-1 pl-5">
				{tags.map((t) => (
					<span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
						{t}
					</span>
				))}
			</div>
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="xs" onClick={accept}>
					Add tags
				</Button>
				<Button size="xs" variant="ghost" onClick={reject}>
					Not now
				</Button>
			</div>
		</Card>
	)
}
