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
	// Bumped whenever a new chat is requested, to refocus the composer.
	const [composerFocusNonce, setComposerFocusNonce] = useState(0)

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

	// Focus the empty AgentPat composer rather than creating a chat up front —
	// the chat is persisted (and titled from the first message) only on send,
	// so unsent "New Chat" entries no longer pollute the sidebar. The nonce
	// bumps every call so the composer refocuses even when already showing.
	function newChat() {
		setActiveChatId("agentpat")
		setComposerFocusNonce((n) => n + 1)
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

	// Start a fresh chat primed with a summary of a previous (overflowed) one.
	// The summary is seeded as the opening message so the new chat carries the
	// gist forward without the old chat's full token weight.
	function newChatWithSummary(summary: string) {
		if (!currentTaskId) return
		const framed = `I'm continuing from an earlier conversation that hit the model's context limit. Below is an auto-generated summary of it (some detail may be lost). Just briefly acknowledge you have the context — do not run any tools or take any actions this turn; wait for my next instruction.\n\n${summary}`
		const id = crypto.randomUUID()
		const now = new Date().toISOString()
		setChats((prev) => [
			{
				id,
				taskPath: currentTaskId,
				title: "Continued chat",
				createdAt: now,
				updatedAt: now,
				lastMessagePreview: "",
				messageCount: 0,
			} as ApiChat,
			...prev,
		])
		openChat(id)
		api.chats.create(currentTaskId, "Continued chat", id).then(() => {
			setPendingMessages((prev) => ({ ...prev, [id]: framed }))
		})
	}

	return {
		chats,
		openChatIds,
		activeChatId,
		pendingMessages,
		composerFocusNonce,
		setActiveChatId,
		openChat,
		closeChat,
		newChat,
		deleteChat,
		updateChat,
		sendInAgentPat,
		newChatWithSummary,
		incrementMessageCount,
	}
}
