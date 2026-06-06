import type { DynamicToolUIPart, ToolUIPart } from "ai"
import { Tag } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { ToolContext } from "./chat-message-parts"

// Generative UI for the suggestTags tool — a human-in-the-loop confirm card. The
// agent proposes triage tags for a source; on accept the client merges them into
// the doc's metadata (union with any existing tags).

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
	const [busy, setBusy] = useState(false)
	const input = part.input as { filename?: string; tags?: string[] } | undefined
	const filename = input?.filename ?? "this document"
	const tags = (input?.tags ?? [])
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean)

	async function accept() {
		setBusy(true)
		try {
			// Merge with any existing tags so we don't clobber the attorney's.
			const all = await api.docmeta.get(ctx.taskId)
			const existing = all[filename]?.tags ?? []
			const merged = [...new Set([...existing, ...tags])]
			await api.docmeta.update(ctx.taskId, filename, { tags: merged })
			ctx.addToolOutput({
				tool: "suggestTags",
				toolCallId: part.toolCallId,
				output: { saved: true, filename, tags },
			})
		} catch {
			setBusy(false)
		}
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
				<Button size="xs" onClick={accept} disabled={busy}>
					Add tags
				</Button>
				<Button size="xs" variant="ghost" onClick={reject} disabled={busy}>
					Not now
				</Button>
			</div>
		</Card>
	)
}
