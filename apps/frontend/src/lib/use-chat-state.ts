import * as React from "react"
import type { ApiChat } from "@patrickos/db"
import { api } from "@/lib/api"

export function useChatState(currentProjectId: string) {
	const [chats, setChats] = React.useState<ApiChat[]>([])
	const [openChatIds, setOpenChatIds] = React.useState<string[]>([])
	const [activeChatId, setActiveChatId] = React.useState("agentpat")
	const [pendingMessages, setPendingMessages] = React.useState<
		Record<string, string>
	>({})

	React.useEffect(() => {
		setChats([])
		setOpenChatIds([])
		setActiveChatId("agentpat")
		setPendingMessages({})
		if (!currentProjectId) return
		api.chats.list(currentProjectId).then(setChats)
	}, [currentProjectId])

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
		if (!currentProjectId) return
		const chat = await api.chats.create(currentProjectId, "New Chat")
		setChats((prev) => [chat, ...prev])
		openChat(chat.id)
	}

	async function deleteChat(id: string) {
		await api.chats.delete(id)
		setChats((prev) => prev.filter((c) => c.id !== id))
		closeChat(id)
	}

	function updateChat(id: string, title: string) {
		setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
		api.chats.update(id, title).catch(() => {})
	}

	function sendInAgentPat(message: string) {
		if (!currentProjectId) return
		const id = crypto.randomUUID()
		const title = message.length > 50 ? `${message.slice(0, 50)}…` : message
		const now = new Date().toISOString()
		// Optimistic: add to list and switch tab immediately
		setChats((prev) => [
			{
				id,
				projectId: currentProjectId,
				title,
				createdAt: now,
				updatedAt: now,
			},
			...prev,
		])
		openChat(id)
		// Persist in background — only seed the message once the chat exists in DB
		api.chats.create(currentProjectId, title, id).then(() => {
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
	}
}
