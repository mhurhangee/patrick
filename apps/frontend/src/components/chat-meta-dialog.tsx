import { Trash2 } from "lucide-react"
import * as React from "react"
import type { Chat } from "@/components/chat-panel"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

export function ChatMetaDialog({
	open,
	chat,
	onClose,
	onUpdated,
	onDeleted,
}: {
	open: boolean
	chat: Chat | undefined
	onClose: () => void
	onUpdated: (id: string, title: string) => void
	onDeleted: (id: string) => void
}) {
	const [title, setTitle] = React.useState("")
	const [saving, setSaving] = React.useState(false)

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only sync on open/switch
	React.useEffect(() => {
		if (open && chat) setTitle(chat.title)
	}, [open, chat?.id])

	function handleSave() {
		if (!chat) return
		setSaving(true)
		onUpdated(chat.id, title.trim() || "New Chat")
		setSaving(false)
		onClose()
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v) onClose()
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{chat?.title ?? ""}</DialogTitle>
					<DialogDescription>Rename or delete this chat.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-5 pt-2">
					<FieldGroup className="gap-3">
						<Field>
							<FieldLabel className="text-xs font-medium text-muted-foreground">
								Title
							</FieldLabel>
							<Input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="New Chat"
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSave()
								}}
							/>
						</Field>
					</FieldGroup>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
					{chat && (
						<>
							<Separator />
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="destructive" size="sm" className="gap-1.5">
										<Trash2 size={14} />
										Delete chat
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent size="sm">
									<AlertDialogHeader>
										<AlertDialogTitle>Delete chat?</AlertDialogTitle>
										<AlertDialogDescription>
											"{chat.title}" will be permanently removed.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={() => {
												onDeleted(chat.id)
												onClose()
											}}
										>
											Delete
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
