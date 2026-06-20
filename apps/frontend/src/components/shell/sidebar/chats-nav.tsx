import type { ChatSummary } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import {
	MessageSquare,
	Pencil,
	Plus,
	Star,
	StarOff,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
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
import { KebabTrigger, RowRenameField } from "./row-controls";
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
				<Button
					variant="ghost"
					size="icon-xxs"
					tooltip="New chat"
					onClick={openNew}
					className="text-muted-foreground/70"
				>
					<Plus />
				</Button>
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
						<RowRenameField
							value={chat.title || chat.lastUser || ""}
							placeholder="Chat title…"
							onCommit={(t) => {
								setRenaming(false);
								onRename(t);
							}}
							onCancel={() => setRenaming(false)}
						/>
					) : (
						<Button
							variant="bare"
							size="auto"
							onClick={onOpen}
							className="w-full min-w-0 flex-col items-start"
						>
							<span className="block w-full truncate text-sm">{title}</span>
							{chat.lastAssistant && (
								<span className="block w-full truncate text-xs text-muted-foreground">
									{chat.lastAssistant}
								</span>
							)}
						</Button>
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

			<ConfirmDialog
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title="Delete this chat?"
				description="This permanently removes the conversation. This can't be undone."
				onConfirm={onDelete}
			/>
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
				<KebabTrigger />
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
