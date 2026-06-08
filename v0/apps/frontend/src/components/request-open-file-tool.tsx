import type { DynamicToolUIPart, ToolUIPart } from "ai"
import { FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ToolContext } from "./chat-message-parts"

// Generative UI for the requestOpenFile tool — a human-in-the-loop confirm card.
// The agent proposes opening a closed document; the user accepts or rejects. On
// accept the client opens the file (so its full content joins the context on the
// next turn) — the agent can only suggest; the user puts a doc in context.

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div className="not-prose my-2 rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
			{children}
		</div>
	)
}

export function RequestOpenFileTool({
	part,
	ctx,
}: {
	part: ToolUIPart | DynamicToolUIPart
	ctx: ToolContext
}) {
	const input = part.input as { filename?: string } | undefined
	const filename = input?.filename ?? "a document"

	function accept() {
		// Open first, then report — so the file is in the open set before the agent
		// loop resubmits and the next request attaches it.
		ctx.onOpenFile(filename)
		ctx.addToolOutput({
			tool: "requestOpenFile",
			toolCallId: part.toolCallId,
			output: { opened: true, filename },
		})
	}

	function reject() {
		ctx.addToolOutput({
			tool: "requestOpenFile",
			toolCallId: part.toolCallId,
			output: { opened: false, filename },
		})
	}

	// Result state — the user already answered.
	if (part.state === "output-available") {
		const output = part.output as { opened?: boolean } | undefined
		return (
			<Card>
				<span className="text-muted-foreground">
					{output?.opened ? (
						<>
							Opened <span className="font-medium">{filename}</span> — now in
							context.
						</>
					) : (
						<>
							Left <span className="font-medium">{filename}</span> closed.
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
					{part.errorText ?? "Could not open the document."}
				</span>
			</Card>
		)
	}

	if (part.state === "input-streaming") {
		return (
			<Card>
				<span className="text-muted-foreground">Preparing request…</span>
			</Card>
		)
	}

	// input-available — awaiting the user's decision.
	return (
		<Card>
			<div className="flex items-center gap-2">
				<FolderOpen size={13} className="shrink-0 text-muted-foreground" />
				<span className="text-foreground">
					Open <span className="font-medium">{filename}</span> so AgentPat can
					read it?
				</span>
			</div>
			<p className="mt-1 pl-5 text-muted-foreground">
				Its full content joins the conversation from your next message.
			</p>
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="xs" onClick={accept}>
					Open
				</Button>
				<Button size="xs" variant="ghost" onClick={reject}>
					Not now
				</Button>
			</div>
		</Card>
	)
}
