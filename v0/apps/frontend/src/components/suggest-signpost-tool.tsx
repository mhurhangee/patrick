import type { DynamicToolUIPart, ToolUIPart } from "ai"
import { Signpost } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ToolContext } from "./chat-message-parts"

// Generative UI for the suggestSignpost tool — a human-in-the-loop confirm card.
// The agent proposes a one-line signpost for a source; on accept it's saved via
// the shared asset state (updates the open tab live), labelling the doc.

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div className="not-prose my-2 rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
			{children}
		</div>
	)
}

export function SuggestSignpostTool({
	part,
	ctx,
}: {
	part: ToolUIPart | DynamicToolUIPart
	ctx: ToolContext
}) {
	const input = part.input as
		| { filename?: string; signpost?: string }
		| undefined
	const filename = input?.filename ?? "this document"
	const signpost = input?.signpost ?? ""

	function accept() {
		ctx.onSetSignpost(filename, signpost)
		ctx.addToolOutput({
			tool: "suggestSignpost",
			toolCallId: part.toolCallId,
			output: { saved: true, filename, signpost },
		})
	}

	function reject() {
		ctx.addToolOutput({
			tool: "suggestSignpost",
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
							Signposted <span className="font-medium">{filename}</span>.
						</>
					) : (
						<>
							Left <span className="font-medium">{filename}</span> unlabelled.
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
					{part.errorText ?? "Could not save the signpost."}
				</span>
			</Card>
		)
	}

	if (part.state === "input-streaming") {
		return (
			<Card>
				<span className="text-muted-foreground">Preparing signpost…</span>
			</Card>
		)
	}

	// input-available — awaiting the user's decision.
	return (
		<Card>
			<div className="flex items-center gap-2">
				<Signpost size={13} className="shrink-0 text-muted-foreground" />
				<span className="text-foreground">
					Signpost <span className="font-medium">{filename}</span>?
				</span>
			</div>
			<p className="mt-1 pl-5 italic text-muted-foreground">“{signpost}”</p>
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="xs" onClick={accept}>
					Save
				</Button>
				<Button size="xs" variant="ghost" onClick={reject}>
					Not now
				</Button>
			</div>
		</Card>
	)
}
