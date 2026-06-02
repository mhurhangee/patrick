import type { ApiChat } from "@patrickos/shared"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export function useChatState(currentTaskId: string) {
	const [chats, setChats] = useState<ApiChat[]>([])
	const [openChatIds, setOpenChatIds] = useState<string[]>([])
	const [activeChatId, setActiveChatId] = useState("agentpat")
	const [pendingMessages, setPendingMessages] = useState<
		Record<string, string>
	>({})

	useEffect(() => {
		setChats([])
		setOpenChatIds([])
		setActiveChatId("agentpat")
		setPendingMessages({})
		if (!currentTaskId) return
		api.chats.list(currentTaskId).then(setChats) // currentTaskId will become taskPath
	}, [currentTaskId])

	function openChat(id: string) {
		setOpenChatIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
		setActiveChatId(id)
	}

	function closeChat(id: string) {
		setOpenChatIds((prev) => {
			const next = prev.filter((c) => c !== id)
			setActiveChatId((active) =>
				active === id ? (next.at(-1) ?? "agentpat") : active,
			)
			return next
		})
	}

	async function newChat() {
		if (!currentTaskId) return
		const chat = await api.chats.create(currentTaskId, "New Chat")
		setChats((prev) => [chat, ...prev])
		openChat(chat.id)
	}

	async function deleteChat(id: string) {
		await api.chats.delete(id, currentTaskId)
		setChats((prev) => prev.filter((c) => c.id !== id))
		closeChat(id)
	}

	function updateChat(id: string, title: string) {
		setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
		api.chats.update(id, currentTaskId, title).catch(() => {})
	}

	function incrementMessageCount(chatId: string) {
		setChats((prev) =>
			prev.map((c) =>
				c.id === chatId ? { ...c, messageCount: (c.messageCount ?? 0) + 1 } : c,
			),
		)
	}

	function sendInAgentPat(message: string) {
		if (!currentTaskId) return
		const id = crypto.randomUUID()
		const title = message.length > 50 ? `${message.slice(0, 50)}…` : message
		const now = new Date().toISOString()
		// Optimistic: add to list and switch tab immediately
		setChats((prev) => [
			{
				id,
				taskPath: currentTaskId,
				title,
				createdAt: now,
				updatedAt: now,
				lastMessagePreview: "",
				messageCount: 0,
			} as ApiChat,
			...prev,
		])
		openChat(id)
		// Persist in background — only seed the message once the chat exists in DB
		api.chats.create(currentTaskId, title, id).then(() => {
			setPendingMessages((prev) => ({ ...prev, [id]: message }))
		})
	}

	return {
		chats,
		openChatIds,
		activeChatId,
		pendingMessages,
		setActiveChatId,
		openChat,
		closeChat,
		newChat,
		deleteChat,
		updateChat,
		sendInAgentPat,
		incrementMessageCount,
	}
}
