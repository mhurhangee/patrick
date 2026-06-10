import type { Chat } from "@patrick/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/api/tasks";

const key = {
	list: (taskId: string) => ["tasks", taskId, "chats"] as const,
	one: (taskId: string, chatId: string) =>
		["tasks", taskId, "chats", chatId] as const,
};

/** Persisted chats for the sidebar list. */
export function useChats(taskId: string | undefined) {
	return useQuery({
		queryKey: key.list(taskId ?? ""),
		queryFn: () => tasksApi.chats(taskId as string),
		enabled: !!taskId,
	});
}

/** Load a chat for its initial messages. A not-yet-persisted (new) chat 404s →
 *  null, which the chat treats as an empty conversation. */
export function useStoredChat(taskId: string | undefined, chatId: string) {
	return useQuery({
		queryKey: key.one(taskId ?? "", chatId),
		queryFn: (): Promise<Chat | null> =>
			tasksApi.chat(taskId as string, chatId).catch(() => null),
		enabled: !!taskId,
		refetchOnWindowFocus: false,
	});
}

export function useDeleteChat(taskId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (chatId: string) =>
			tasksApi.removeChat(taskId as string, chatId),
		onSuccess: () => qc.invalidateQueries({ queryKey: key.list(taskId ?? "") }),
	});
}

/** Refresh the sidebar list (call after a turn persists). */
export function useRefreshChats(taskId: string | undefined) {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: key.list(taskId ?? "") });
}
