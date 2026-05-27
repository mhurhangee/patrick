import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { Clover, Loader2, MessageSquare, Plus, Send, X } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty"
import { Textarea } from "@/components/ui/textarea"
import { useAI } from "@/lib/ai-context"
import { type ApiAsset, api, BASE_URL } from "@/lib/api"
import type { Chat as ApiChat } from "@/lib/use-chat-state"
import { cn } from "@/lib/utils"

export type { ApiChat as Chat }

// ─── Data ─────────────────────────────────────────────────────────────────────

const AGENTPAT_SUGGESTIONS = [
	"Draft a §103 response",
	"Search prior art",
	"Amend claims",
]

// ─── AgentPat pane ────────────────────────────────────────────────────────────

function AgentPatPane({
	onSend,
	onOpenSettings,
}: {
	onSend: (message: string) => void
	onOpenSettings: () => void
}) {
	const { connectedToAI } = useAI()
	const [input, setInput] = React.useState("")

	function send(message: string) {
		const trimmed = message.trim()
		if (!trimmed) return
		onSend(trimmed)
		setInput("")
	}

	if (!connectedToAI) {
		return (
			<div className="flex flex-1 min-h-0 items-center justify-center bg-sidebar">
				<Empty className="max-w-xs border-0">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Clover className="text-muted-foreground/40" />
						</EmptyMedia>
						<EmptyTitle>AgentPat</EmptyTitle>
						<EmptyDescription>
							Connect an AI provider in Settings to start using AgentPat.
						</EmptyDescription>
					</EmptyHeader>
					<Button size="sm" variant="outline" onClick={onOpenSettings}>
						Open Settings
					</Button>
				</Empty>
			</div>
		)
	}

	return (
		<div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-sidebar">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto max-w-sm px-6 py-10 text-center">
					<div className="mb-4 flex justify-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
							<Clover className="size-8 text-primary" />
						</div>
					</div>
					<h2 className="mb-1 font-heading text-lg font-semibold">AgentPat</h2>
					<p className="text-sm text-muted-foreground">
						Your AI patent attorney assistant. To get started send a message or
						pick a suggestion.
					</p>
				</div>
			</div>
			<div className="tab-scroll flex shrink-0 gap-2 overflow-x-auto px-3">
				{AGENTPAT_SUGGESTIONS.map((s) => (
					<Button
						key={s}
						variant="secondary"
						size="sm"
						className="h-auto rounded-full px-3 py-1.5 text-xs font-normal"
						onClick={() => send(s)}
					>
						{s}
					</Button>
				))}
			</div>
			<div className="shrink-0 p-3">
				<div className="rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
					<Textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								send(input)
							}
						}}
						placeholder="Ask AgentPat anything…"
						className="min-h-[64px] resize-none rounded-none border-0 bg-transparent p-3 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
					/>
					<div className="flex justify-end px-3 pb-2">
						<Button size="sm" onClick={() => send(input)}>
							Send <Send />
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

// ─── Chat pane ────────────────────────────────────────────────────────────────

function ChatPane({
	chatId,
	openAssets,
	onRemoveAsset,
	initialMessages,
	initialMessage,
	projectId,
	provider,
	apiKey,
	quickModel,
}: {
	chatId: string
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	initialMessages: UIMessage[]
	initialMessage?: string | null
	projectId: string
	provider: string
	apiKey: string
	quickModel: string
}) {
	const openAssetIds = openAssets.map((a) => a.id)
	const bottomRef = React.useRef<HTMLDivElement>(null)
	const [input, setInput] = React.useState("")
	const sentInitial = React.useRef(false)

	const { messages, sendMessage, status } = useChat({
		transport: new DefaultChatTransport({
			api: `${BASE_URL}/chats/${chatId}/messages`,
			body: { projectId, openAssetIds, provider, apiKey, quickModel },
		}),
		messages: initialMessages,
	})

	const isStreaming = status === "streaming" || status === "submitted"

	function send() {
		const trimmed = input.trim()
		if (!trimmed || isStreaming) return
		sendMessage({ text: trimmed })
		setInput("")
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: sendMessage is stable, sentInitial is a ref
	React.useEffect(() => {
		if (initialMessage && !sentInitial.current) {
			sentInitial.current = true
			sendMessage({ text: initialMessage })
		}
	}, [initialMessage])

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message count change, ref not a dep
	React.useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [messages.length])

	return (
		<div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-sidebar">
			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				<div className="space-y-4">
					{messages.length === 0 ? (
						<p className="py-12 text-center text-sm text-muted-foreground">
							No messages yet. Start the conversation below.
						</p>
					) : (
						messages.map((msg) => (
							<div
								key={msg.id}
								className={cn(
									"flex flex-col gap-1",
									msg.role === "user" ? "items-end" : "items-start",
								)}
							>
								{msg.parts.map((part, i) => {
									if (part.type === "text") {
										const isLast = i === msg.parts.length - 1
										const isLastMsg = msg === messages[messages.length - 1]
										return (
											<div
												key={`${msg.id}-${
													// biome-ignore lint/suspicious/noArrayIndexKey: parts are a stable ordered array
													i
												}`}
												className={cn(
													"max-w-[88%] rounded-lg px-3 py-2 text-sm",
													msg.role === "user"
														? "bg-primary/10 text-foreground"
														: "text-foreground prose prose-sm dark:prose-invert max-w-none",
												)}
											>
												{msg.role === "user" ? (
													part.text
												) : (
													<Streamdown
														isAnimating={isStreaming && isLast && isLastMsg}
													>
														{part.text}
													</Streamdown>
												)}
											</div>
										)
									}
									return null
								})}
							</div>
						))
					)}
					{isStreaming && (
						<div className="flex items-start">
							<div className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground">
								<Loader2 size={12} className="animate-spin" />
								Thinking…
							</div>
						</div>
					)}
					<div ref={bottomRef} />
				</div>
			</div>
			<div className="shrink-0 space-y-2 p-3">
				{openAssets.length > 0 && (
					<div className="flex flex-wrap items-center gap-1">
						<span className="shrink-0 text-xs text-muted-foreground">
							In context:
						</span>
						{openAssets.map((asset) => (
							<span
								key={asset.id}
								className="flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
							>
								{asset.title}
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => onRemoveAsset(asset.id)}
									className="h-auto w-auto p-0 hover:bg-transparent"
								>
									<X size={9} />
								</Button>
							</span>
						))}
					</div>
				)}
				<div className="rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
					<Textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								send()
							}
						}}
						disabled={isStreaming}
						placeholder="Ask about open assets…"
						className="min-h-[64px] resize-none rounded-none border-0 bg-transparent p-3 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
					/>
					<div className="flex justify-end px-3 pb-2">
						<Button
							size="sm"
							onClick={send}
							disabled={isStreaming || !input.trim()}
						>
							Send <Send />
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

// Loads history then renders ChatPane
function ChatPaneLoader({
	chatId,
	...rest
}: {
	chatId: string
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	initialMessage?: string | null
	projectId: string
	provider: string
	apiKey: string
	quickModel: string
}) {
	const [initialMessages, setInitialMessages] = React.useState<
		UIMessage[] | null
	>(null)

	React.useEffect(() => {
		setInitialMessages(null)
		api.chats
			.getMessages(chatId)
			.then((msgs) =>
				setInitialMessages(
					msgs.map((m) => ({
						id: m.id,
						role: m.role,
						parts: m.parts as UIMessage["parts"],
						createdAt: new Date(m.createdAt),
					})),
				),
			)
			.catch(() => setInitialMessages([]))
	}, [chatId])

	if (initialMessages === null) {
		return (
			<div className="flex h-full items-center justify-center bg-sidebar">
				<Loader2 size={16} className="animate-spin text-muted-foreground" />
			</div>
		)
	}

	return (
		<ChatPane chatId={chatId} initialMessages={initialMessages} {...rest} />
	)
}

// ─── Chat panel ───────────────────────────────────────────────────────────────

export function ChatPanel({
	chats,
	openChatIds,
	activeChatId,
	openAssets,
	pendingMessages,
	projectId,
	provider,
	apiKey,
	quickModel,
	onNewChat,
	onCloseChat,
	onSetActiveChat,
	onSendInAgentPat,
	onRemoveAsset,
	onOpenSettings,
}: {
	chats: ApiChat[]
	openChatIds: string[]
	activeChatId: string
	openAssets: ApiAsset[]
	pendingMessages: Record<string, string>
	projectId: string
	provider: string
	apiKey: string
	quickModel: string
	onNewChat: () => void
	onCloseChat: (id: string) => void
	onSetActiveChat: (id: string) => void
	onSendInAgentPat: (message: string) => void
	onRemoveAsset: (id: string) => void
	onOpenSettings: () => void
}) {
	const openChats = openChatIds
		.map((id) => chats.find((c) => c.id === id))
		.filter(Boolean) as ApiChat[]
	const activeChat = openChats.find((c) => c.id === activeChatId)

	return (
		<div className="flex h-full flex-col overflow-hidden border-l">
			{/* Tab bar */}
			<div className="relative flex h-10 shrink-0 items-end gap-0.5 bg-muted px-1">
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />

				{/* AgentPat — fixed left, shrinks to icon when other tabs are open */}
				<div
					className={cn(
						"relative z-10 flex shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
						activeChatId === "agentpat"
							? "border-border bg-sidebar text-foreground"
							: "border-transparent text-muted-foreground hover:text-foreground",
					)}
				>
					<Button
						variant="ghost"
						size="xs"
						onClick={() => onSetActiveChat("agentpat")}
						className="gap-1.5"
					>
						<Clover className="size-4 shrink-0 text-primary" />
						{openChatIds.length === 0 && <span>AgentPat</span>}
					</Button>
				</div>

				{/* Open chat tabs */}
				<div className="tab-scroll flex flex-1 items-end gap-0.5 overflow-x-auto">
					{openChats.map((chat) => (
						<div
							key={chat.id}
							className={cn(
								"group relative flex shrink-0 items-center rounded-t-md border border-b-0 text-xs transition-colors",
								activeChatId === chat.id
									? "z-10 border-border bg-sidebar text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							<Button
								variant="ghost"
								size="xs"
								onClick={() => onSetActiveChat(chat.id)}
								className="gap-1.5 rounded-none rounded-tl-md pr-0.5"
							>
								<MessageSquare size={12} className="shrink-0" />
								<span className="max-w-[120px] truncate">{chat.title}</span>
							</Button>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={() => onCloseChat(chat.id)}
								className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
							>
								<X size={10} />
							</Button>
						</div>
					))}
				</div>

				{/* Plus — new chat */}
				<div className="relative z-10 flex shrink-0 items-center rounded-t-md border border-b-0 border-transparent text-muted-foreground transition-colors hover:text-foreground">
					<Button
						variant="ghost"
						size="xs"
						onClick={onNewChat}
						title="New chat"
					>
						<Plus size={12} />
					</Button>
				</div>
			</div>

			{/* Content */}
			{activeChatId === "agentpat" || !activeChat ? (
				<AgentPatPane
					onSend={onSendInAgentPat}
					onOpenSettings={onOpenSettings}
				/>
			) : (
				<ChatPaneLoader
					key={activeChat.id}
					chatId={activeChat.id}
					openAssets={openAssets}
					onRemoveAsset={onRemoveAsset}
					initialMessage={pendingMessages[activeChat.id] ?? null}
					projectId={projectId}
					provider={provider}
					apiKey={apiKey}
					quickModel={quickModel}
				/>
			)}
		</div>
	)
}
