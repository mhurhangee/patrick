import type { DynamicToolUIPart, ToolUIPart } from "ai"
import { Clover, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { ToolContext } from "./chat-message-parts"

// Generative UI for the extractSource tool — a human-in-the-loop confirm card.
// The agent proposes extracting from a source; the user confirms; the client runs
// ExtractPat and feeds the result back so the agent can continue.

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div className="not-prose my-2 rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
			{children}
		</div>
	)
}

export function ExtractSourceTool({
	part,
	ctx,
}: {
	part: ToolUIPart | DynamicToolUIPart
	ctx: ToolContext
}) {
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const input = part.input as
		| { filename?: string; assetType?: string }
		| undefined
	const filename = input?.filename ?? "this source"
	const assetType = input?.assetType

	async function confirm() {
		if (!ctx.apiKey) {
			setError("Connect an AI provider in settings first.")
			return
		}
		setBusy(true)
		setError(null)
		try {
			const rec = await api.extractpat.extract(
				`${ctx.taskId}/${filename}`,
				assetType || "auto",
				ctx.provider,
				ctx.apiKey,
				ctx.model,
			)
			ctx.addToolOutput({
				tool: "extractSource",
				toolCallId: part.toolCallId,
				output: {
					extracted: true,
					filename,
					assetType: rec.assetType,
					fields: Object.keys(rec.details).length,
				},
			})
			ctx.onExtracted()
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Extraction failed."
			setError(msg)
			setBusy(false)
		}
	}

	function skip() {
		ctx.addToolOutput({
			tool: "extractSource",
			toolCallId: part.toolCallId,
			output: { declined: true, filename },
		})
	}

	// Result state — the user already answered.
	if (part.state === "output-available") {
		const output = part.output as
			| { declined?: boolean; extracted?: boolean; assetType?: string }
			| undefined
		if (output?.declined) {
			return (
				<Card>
					<span className="text-muted-foreground">
						Skipped extraction of{" "}
						<span className="font-medium">{filename}</span>.
					</span>
				</Card>
			)
		}
		return (
			<Card>
				<div className="flex items-center justify-between gap-2">
					<span className="text-foreground">
						Extracted <span className="font-medium">{filename}</span>
						{output?.assetType ? (
							<span className="text-muted-foreground">
								{" "}
								· {output.assetType}
							</span>
						) : null}
					</span>
					<Button
						size="xs"
						variant="outline"
						onClick={() => ctx.onReview(filename)}
					>
						Review
					</Button>
				</div>
			</Card>
		)
	}

	if (part.state === "output-error") {
		return (
			<Card>
				<span className="text-destructive">
					{part.errorText ?? "Extraction failed."}
				</span>
			</Card>
		)
	}

	if (part.state === "input-streaming") {
		return (
			<Card>
				<span className="text-muted-foreground">Preparing extraction…</span>
			</Card>
		)
	}

	// input-available — awaiting the user's decision.
	return (
		<Card>
			<div className="flex items-center gap-2">
				<Clover size={13} className="shrink-0 text-muted-foreground" />
				<span className="text-foreground">
					Run ExtractPat on <span className="font-medium">{filename}</span>?
				</span>
			</div>
			<p className="mt-1 pl-5 text-muted-foreground">
				{assetType
					? `Extract as ${assetType}.`
					: "Auto-detect the type, then extract structured data."}
			</p>
			{error && <p className="mt-1 pl-5 text-destructive">{error}</p>}
			<div className="mt-2 flex gap-2 pl-5">
				<Button size="xs" onClick={confirm} disabled={busy}>
					{busy ? <Loader2 size={12} className="animate-spin" /> : "Extract"}
				</Button>
				<Button size="xs" variant="ghost" onClick={skip} disabled={busy}>
					Skip
				</Button>
			</div>
		</Card>
	)
}
