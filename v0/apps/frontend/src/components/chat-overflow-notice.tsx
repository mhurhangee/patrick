import { Loader2, MessageSquarePlus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

// Shown in the transcript when a turn exceeded the model's context window. The
// honest recovery: the chat is saved on disk; start a fresh one (closing docs
// frees the most space), optionally primed with a summary of this one.
export function ChatOverflowNotice({
	onNewChat,
	onSummarise,
	summarising,
}: {
	onNewChat: () => void
	onSummarise: () => void
	summarising?: boolean
}) {
	return (
		<div className="mx-3 mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
			<p className="text-sm font-medium">
				You've reached the AI model's context limit.
			</p>
			<p className="mt-1 text-xs text-muted-foreground">
				Every AI model can only read a fixed amount at once — this is the
				provider's hard limit. This conversation (open documents, tool results
				and history) no longer fits. Your chat is saved; start a fresh one to
				continue — closing documents frees the most space.
			</p>
			<div className="mt-2 flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="secondary"
					onClick={onNewChat}
					disabled={summarising}
				>
					<MessageSquarePlus />
					New chat
				</Button>
				<Button size="sm" onClick={onSummarise} disabled={summarising}>
					{summarising ? <Loader2 className="animate-spin" /> : <Sparkles />}
					{summarising ? "Summarising…" : "New chat with summary"}
				</Button>
			</div>
		</div>
	)
}
