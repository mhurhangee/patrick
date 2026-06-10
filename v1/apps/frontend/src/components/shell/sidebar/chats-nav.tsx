import type { ChatSummary } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { useChats, useDeleteChat } from "@/hooks/use-chats";
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
	onDelete,
}: {
	chat: ChatSummary;
	active: boolean;
	onOpen: () => void;
	onDelete: () => void;
}) {
	return (
		<div
			className={cn(
				"group flex items-start gap-2 rounded-none border-l-2 py-1.5 pr-1 pl-2 transition-colors hover:bg-sidebar-accent",
				active ? "border-primary bg-sidebar-accent/50" : "border-transparent",
			)}
		>
			<MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<button
				type="button"
				onClick={onOpen}
				className="min-w-0 flex-1 text-left"
			>
				<span className="block truncate text-sm">
					{chat.lastUser || "New chat"}
				</span>
				{chat.lastAssistant && (
					<span className="block truncate text-xs text-muted-foreground">
						{chat.lastAssistant}
					</span>
				)}
			</button>
			<button
				type="button"
				onClick={onDelete}
				title="Delete chat"
				className="shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
			>
				<Trash2 className="size-3.5" />
			</button>
		</div>
	);
}
