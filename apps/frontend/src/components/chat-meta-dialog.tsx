import type { ApiChat, ApiChatMessage } from "@patrickos/db"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ChatStats = {
	messageCount: number
	inputTokens: number
	outputTokens: number
}

function computeStats(messages: ApiChatMessage[]): ChatStats {
	let inputTokens = 0
	let outputTokens = 0
	let messageCount = 0

	for (const msg of messages) {
		if (msg.role === "user") {
			messageCount++
		} else {
			const usage = (
				msg.metadata as {
					usage?: { inputTokens?: number; outputTokens?: number }
				}
			).usage
			inputTokens += usage?.inputTokens ?? 0
			outputTokens += usage?.outputTokens ?? 0
		}
	}

	return { messageCount, inputTokens, outputTokens }
}

function formatTokens(n: number): string {
	if (n === 0) return "—"
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(n)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatMetaDialog({
	open,
	chat,
	onClose,
	onUpdated,
	onDeleted,
}: {
	open: boolean
	chat: ApiChat | undefined
	onClose: () => void
	onUpdated: (id: string, title: string) => void
	onDeleted: (id: string) => void
}) {
	const [title, setTitle] = useState("")
	const [deleteOpen, setDeleteOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [stats, setStats] = useState<ChatStats | null>(null)
	const [loadingStats, setLoadingStats] = useState(false)

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync on open/chat identity only
	useEffect(() => {
		if (!open || !chat) return
		setTitle(chat.title)
		setStats(null)
		setLoadingStats(true)
		api.chats
			.getMessages(chat.id)
			.then((msgs) => setStats(computeStats(msgs)))
			.finally(() => setLoadingStats(false))
	}, [open, chat?.id])

	function handleSave() {
		if (!chat) return
		onUpdated(chat.id, title.trim() || "New Chat")
		onClose()
	}

	async function handleDelete() {
		if (!chat) return
		setDeleting(true)
		try {
			onDeleted(chat.id)
			setDeleteOpen(false)
			onClose()
		} finally {
			setDeleting(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v) onClose()
			}}
		>
			<DialogContent className="flex flex-col overflow-hidden p-0 sm:max-w-[400px]">
				<DialogHeader>
					<DialogTitle>Edit Chat</DialogTitle>
					<DialogDescription>
						Rename your chat and view its statistics.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto px-6 py-4">
					<div className="flex flex-col gap-5">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="chat-title">Title</Label>
							<Input
								id="chat-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="New Chat"
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSave()
								}}
							/>
						</div>

						<Separator />

						<div className="flex flex-col gap-3">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Stats
							</p>
							{loadingStats ? (
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<Loader2 size={12} className="animate-spin" />
									Loading…
								</div>
							) : (
								<div className="grid grid-cols-3 gap-3">
									<div className="flex flex-col gap-0.5">
										<p className="text-xs text-muted-foreground">Messages</p>
										<p className="text-sm font-medium tabular-nums">
											{stats ? stats.messageCount : "—"}
										</p>
									</div>
									<div className="flex flex-col gap-0.5">
										<p className="text-xs text-muted-foreground">Tokens in</p>
										<p className="text-sm font-medium tabular-nums">
											{stats ? formatTokens(stats.inputTokens) : "—"}
										</p>
									</div>
									<div className="flex flex-col gap-0.5">
										<p className="text-xs text-muted-foreground">Tokens out</p>
										<p className="text-sm font-medium tabular-nums">
											{stats ? formatTokens(stats.outputTokens) : "—"}
										</p>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>

				<div className="flex shrink-0 items-center justify-between border-t px-6 py-3">
					<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
						<AlertDialogTrigger asChild>
							<Button variant="destructive">Delete</Button>
						</AlertDialogTrigger>
						<AlertDialogContent size="sm">
							<AlertDialogHeader>
								<AlertDialogTitle>Delete chat?</AlertDialogTitle>
								<AlertDialogDescription>
									"{chat?.title}" will be permanently removed.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={deleting}>
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									disabled={deleting}
									onClick={(e) => {
										e.preventDefault()
										handleDelete()
									}}
								>
									{deleting ? (
										<Loader2 size={12} className="animate-spin" />
									) : (
										"Delete"
									)}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>

					<Button onClick={handleSave} variant="secondary">
						Save
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
