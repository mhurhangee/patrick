import type { ChatSummary } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import {
	MessageSquare,
	MoreHorizontal,
	Pencil,
	Plus,
	Star,
	StarOff,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChats, useDeleteChat, useUpdateChatMeta } from "@/hooks/use-chats";
import { useActiveChat } from "@/lib/active-chat";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";
import { Section } from "./section";

export function ChatsNav() {
	const navigate = useNavigate();
	const { activeTaskId } = useActiveTask();
	const { activeChatId, newChat, selectChat } = useActiveChat();
	const { data: chats } = useChats(activeTaskId);
	const del = useDeleteChat(activeTaskId);
	const meta = useUpdateChatMeta(activeTaskId);

	const openNew = () => {
		newChat();
		navigate({ to: "/workspace" });
	};
	const open = (id: string) => {
		selectChat(id);
		navigate({ to: "/workspace" });
	};
	const remove = (id: string) => {
		if (id === activeChatId) newChat();
		del.mutate(id);
	};

	return (
		<Section
			label="Chats"
			action={
				<button
					type="button"
					onClick={openNew}
					title="New chat"
					className="rounded p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
				>
					<Plus className="size-4" />
				</button>
			}
		>
			{chats?.length === 0 && (
				<p className="px-2 py-1 text-xs text-muted-foreground">
					No chats yet. Start one with the + above.
				</p>
			)}
			{chats?.map((chat) => (
				<ChatRow
					key={chat.id}
					chat={chat}
					active={chat.id === activeChatId}
					onOpen={() => open(chat.id)}
					onStar={() =>
						meta.mutate({ chatId: chat.id, starred: !chat.starred })
					}
					onRename={(title) =>
						meta.mutate({ chatId: chat.id, customTitle: title })
					}
					onDelete={() => remove(chat.id)}
				/>
			))}
		</Section>
	);
}

function ChatRow({
	chat,
	active,
	onOpen,
	onStar,
	onRename,
	onDelete,
}: {
	chat: ChatSummary;
	active: boolean;
	onOpen: () => void;
	onStar: () => void;
	onRename: (title: string) => void;
	onDelete: () => void;
}) {
	const [renaming, setRenaming] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const title = chat.title || chat.lastUser || "New chat";

	return (
		<div
			className={cn(
				"group rounded-none border-l-2 transition-colors hover:bg-sidebar-accent",
				active ? "border-primary bg-sidebar-accent/50" : "border-transparent",
			)}
		>
			<div className="flex items-start gap-2 py-1.5 pr-1 pl-2">
				<MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					{renaming ? (
						<ChatRenameField
							value={chat.title || chat.lastUser || ""}
							onCommit={(t) => {
								setRenaming(false);
								onRename(t);
							}}
							onCancel={() => setRenaming(false)}
						/>
					) : (
						<button
							type="button"
							onClick={onOpen}
							className="block w-full min-w-0 text-left"
						>
							<span className="block truncate text-sm">{title}</span>
							{chat.lastAssistant && (
								<span className="block truncate text-xs text-muted-foreground">
									{chat.lastAssistant}
								</span>
							)}
						</button>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-0.5">
					{chat.starred && (
						<Star className="size-3.5 shrink-0 fill-current text-primary" />
					)}
					<ChatMenu
						starred={!!chat.starred}
						onStar={onStar}
						onRename={() => setRenaming(true)}
						onDelete={() => setConfirmDelete(true)}
					/>
				</div>
			</div>

			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this chat?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes the conversation. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel size="default" variant="outline">
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							size="default"
							variant="destructive"
							onClick={onDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function ChatMenu({
	starred,
	onStar,
	onRename,
	onDelete,
}: {
	starred: boolean;
	onStar: () => void;
	onRename: () => void;
	onDelete: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					title="More"
					className="shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
				>
					<MoreHorizontal className="size-4" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44">
				<DropdownMenuItem onSelect={onStar}>
					{starred ? <StarOff /> : <Star />}
					{starred ? "Unstar" : "Star"}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={onRename}>
					<Pencil />
					Rename
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onDelete} variant="destructive">
					<Trash2 />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ChatRenameField({
	value,
	onCommit,
	onCancel,
}: {
	value: string;
	onCommit: (title: string) => void;
	onCancel: () => void;
}) {
	const [text, setText] = useState(value);
	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: a rename field exists to be typed in
			autoFocus
			value={text}
			onChange={(e) => setText(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") onCommit(text.trim());
				if (e.key === "Escape") onCancel();
			}}
			onBlur={onCancel}
			placeholder="Chat title…"
			className="w-full min-w-0 rounded-md border border-ring bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
		/>
	);
}
