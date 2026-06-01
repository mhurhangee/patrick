import { useChat } from "@ai-sdk/react"
import {
	DefaultChatTransport,
	getToolName,
	isToolUIPart,
	type UIMessage,
} from "ai"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import type { ApiAsset, ApiChat } from "@patrickos/shared"
import { ArrowUp, Loader2, Plus, X } from "lucide-react"
import {
	Fragment,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { Button } from "@/components/ui/button"
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty"
import { Textarea } from "@/components/ui/textarea"
import { useAI } from "@/lib/ai-context"
import { CURATED_MODELS, GATEWAY_DETAILED_MODELS } from "@/lib/ai-models"
import { api, BASE_URL } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
	ExchangePanel,
	type ExchangePanelData,
	StreamingSpacer,
} from "./exchange-panel"

// ─── Data ─────────────────────────────────────────────────────────────────────

const FALLBACK_SUGGESTIONS = [
	"Draft §103 response",
	"Amend claims",
	"Search prior art",
]

function getModelPricing(provider: string, modelId: string) {
	if (provider === "gateway") {
		return (
			GATEWAY_DETAILED_MODELS.find((m) => m.id === modelId)?.pricingPerM ?? null
		)
	}
	const list = CURATED_MODELS[provider as "anthropic" | "openai"]
	return list?.find((m) => m.id === modelId)?.pricingPerM ?? null
}

// ─── Shared input bar ─────────────────────────────────────────────────────────

function ChatInputBar({
	openAssets,
	onRemoveAsset,
	onOpenAsset,
	input,
	onInputChange,
	onSend,
	disabled,
	textareaRef,
}: {
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	onOpenAsset: (id: string) => void
	input: string
	onInputChange: (value: string) => void
	onSend: () => void
	disabled?: boolean
	textareaRef?: RefObject<HTMLTextAreaElement | null>
}) {
	return (
		<div className="shrink-0 space-y-2 pb-3 px-3 pt-0">
			<div className="rounded-lg border bg-transparent focus-within:ring-1 focus-within:ring-ring">
				<Textarea
					ref={textareaRef}
					value={input}
					onChange={(e) => onInputChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault()
							onSend()
						}
					}}
					disabled={disabled}
					placeholder=""
					className="min-h-[64px] resize-none rounded-none border-0 bg-transparent p-3 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
				/>

				<div className="flex justify-between px-3 pb-2">
					{openAssets.length === 0 ? (
						<span className="select-none pl-1 text-xxs text-muted-foreground/40 pt-2">
							Open docs are sent to the AI
						</span>
					) : (
						<div className="flex flex-wrap items-center gap-1">
							{openAssets.map((asset) => (
								<span
									key={asset.id}
									className="group/chip inline-flex items-center gap-1"
								>
									<button
										type="button"
										onClick={() => onOpenAsset(asset.id)}
										className="cursor-pointer capitalize truncate text-xxs font-medium text-muted-foreground hover:text-foreground"
									>
										{asset.title}
									</button>
									<button
										type="button"
										onClick={() => onRemoveAsset(asset.id)}
										className="opacity-0 transition-opacity group-hover/chip:opacity-100 text-muted-foreground"
									>
										<X size={9} />
									</button>
								</span>
							))}
						</div>
					)}
					<Button
						size="icon"
						onClick={onSend}
						disabled={disabled || !input.trim()}
					>
						<ArrowUp />
					</Button>
				</div>
			</div>
		</div>
	)
}

// ─── AgentPat pane ────────────────────────────────────────────────────────────

function AgentPatPane({
	onSend,
	openAssets,
	onRemoveAsset,
	onOpenAsset,
}: {
	onSend: (message: string) => void
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	onOpenAsset: (id: string) => void
}) {
	const [input, setInput] = useState("")

	function send() {
		const trimmed = input.trim()
		if (!trimmed) return
		onSend(trimmed)
		setInput("")
	}

	return (
		<div className="flex flex-1 min-h-0 flex-col overflow-hidden">
			<Empty className="max-w-xs mx-auto">
				<EmptyHeader>
					<EmptyTitle>AgentPat</EmptyTitle>
					<EmptyContent>
						Send a message to your AI patent assistant
					</EmptyContent>
				</EmptyHeader>
			</Empty>
			<ChatInputBar
				openAssets={openAssets}
				onRemoveAsset={onRemoveAsset}
				onOpenAsset={onOpenAsset}
				input={input}
				onInputChange={setInput}
				onSend={send}
			/>
		</div>
	)
}

// ─── Chat pane ────────────────────────────────────────────────────────────────

type Exchange = {
	id: string
	userMsg: UIMessage
	assistantMsg: UIMessage | null
}

function ChatPane({
	chatId,
	openAssets,
	onRemoveAsset,
	onOpenAsset,
	initialMessages,
	initialMessage,
	projectId,
	provider,
	apiKey,
	detailedModel,
	onTitleUpdate,
	onMessageSent,
}: {
	chatId: string
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	onOpenAsset: (id: string) => void
	initialMessages: UIMessage[]
	initialMessage?: string | null
	projectId: string
	provider: string
	apiKey: string
	detailedModel: string
	onTitleUpdate: (title: string) => void
	onMessageSent: () => void
}) {
	const openAssetIdsRef = useRef<string[]>([])
	openAssetIdsRef.current = openAssets.map((a) => a.id)

	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const lastUserMsgRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [containerHeight, setContainerHeight] = useState(400)
	const [input, setInput] = useState("")
	const sentInitial = useRef(false)
	// closedIds: latest panels the user has manually collapsed
	// openIds: non-latest panels the user has manually expanded
	const [closedIds, setClosedIds] = useState<Set<string>>(new Set())
	const [openIds, setOpenIds] = useState<Set<string>>(new Set())
	const [exchangeDurations, setExchangeDurations] = useState<
		Record<string, number>
	>({})
	const [exchangeTtfts, setExchangeTtfts] = useState<Record<string, number>>({})
	const sendStartTimeRef = useRef<number | null>(null)
	const pendingContextRef = useRef<Array<{ id: string; title: string }>>([])
	const [exchangeContextSnapshots, setExchangeContextSnapshots] = useState<
		Record<string, Array<{ id: string; title: string }>>
	>({})

	const { messages, sendMessage, status } = useChat({
		transport: new DefaultChatTransport({
			api: `${BASE_URL}/chats/${chatId}/messages`,
			body: { projectPath: projectId, provider, apiKey, detailedModel },
			prepareSendMessagesRequest: ({ body, messages: uiMessages, id }) => ({
				body: {
					...body,
					id,
					messages: uiMessages,
					openFilePaths: openAssetIdsRef.current,
				},
			}),
		}),
		messages: initialMessages,
	})

	const isStreaming = status === "streaming" || status === "submitted"

	// Focus textarea on mount for new (empty) chats
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
	useEffect(() => {
		if (initialMessages.length === 0) textareaRef.current?.focus()
	}, [])

	// Measure scroll container once + whenever it resizes (user drags panel)
	useEffect(() => {
		const el = scrollContainerRef.current
		if (!el) return
		setContainerHeight(el.clientHeight)
		const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight))
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	// Group flat messages into user/assistant exchange pairs
	const exchanges = useMemo<Exchange[]>(() => {
		const result: Exchange[] = []
		let i = 0
		while (i < messages.length) {
			const msg = messages[i]
			if (msg.role === "user") {
				const next = messages[i + 1]
				const assistantMsg = next?.role === "assistant" ? next : null
				result.push({ id: msg.id, userMsg: msg, assistantMsg })
				i += assistantMsg ? 2 : 1
			} else {
				i++
			}
		}
		return result
	}, [messages])

	const latestExchangeId = exchanges.at(-1)?.id

	// Scroll latest user message to top on new send — not on initial history load.
	// useLayoutEffect fires before paint so there's no flash of the old position.
	const prevLatestExchangeIdRef = useRef<string | undefined>(undefined)
	useLayoutEffect(() => {
		if (!latestExchangeId) return
		if (prevLatestExchangeIdRef.current === undefined) {
			prevLatestExchangeIdRef.current = latestExchangeId
			return
		}
		if (prevLatestExchangeIdRef.current === latestExchangeId) return
		prevLatestExchangeIdRef.current = latestExchangeId
		lastUserMsgRef.current?.scrollIntoView({
			block: "start",
			behavior: "instant",
		})
		const snapshot = pendingContextRef.current
		setExchangeContextSnapshots((prev) => ({
			...prev,
			[latestExchangeId]: snapshot,
		}))
	}, [latestExchangeId])

	// Capture TTFT on first streaming chunk, duration when done
	const prevStatusRef = useRef(status)
	useEffect(() => {
		const prev = prevStatusRef.current
		if (prev === "submitted" && status === "streaming") {
			if (sendStartTimeRef.current !== null && latestExchangeId) {
				setExchangeTtfts((p) => ({
					...p,
					[latestExchangeId]: Date.now() - (sendStartTimeRef.current ?? 0),
				}))
			}
		}
		if (prev !== "ready" && status === "ready") {
			if (sendStartTimeRef.current !== null && latestExchangeId) {
				const durationMs = Date.now() - sendStartTimeRef.current
				sendStartTimeRef.current = null
				setExchangeDurations((p) => ({ ...p, [latestExchangeId]: durationMs }))
			}
		}
		prevStatusRef.current = status
	}, [status, latestExchangeId])

	// Update chat title from the latest resolved generateMetadata tool call
	const appliedTitleRef = useRef<string | null>(null)
	useEffect(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i]
			if (msg.role !== "assistant") continue
			const metaPart = msg.parts.find(
				(p) => p.type === "tool-generateMetadata",
			) as { state: string; input?: { chatTitle?: string } } | undefined
			const title =
				metaPart?.state === "input-available"
					? metaPart.input?.chatTitle
					: undefined
			if (title && title !== appliedTitleRef.current) {
				appliedTitleRef.current = title
				onTitleUpdate(title)
			}
			break
		}
	}, [messages, onTitleUpdate])

	// biome-ignore lint/correctness/useExhaustiveDependencies: sendMessage is stable, sentInitial/pendingContextRef are refs
	useEffect(() => {
		if (!initialMessage || sentInitial.current) return
		// If message already exists in loaded history (tab switch back), don't resend
		const alreadyInHistory = initialMessages.some(
			(m) =>
				m.role === "user" &&
				m.parts.some(
					(p) =>
						p.type === "text" &&
						(p as { type: "text"; text: string }).text === initialMessage,
				),
		)
		if (alreadyInHistory) return
		sentInitial.current = true
		sendStartTimeRef.current = Date.now()
		pendingContextRef.current = openAssets.map((a) => ({
			id: a.id,
			title: a.title,
		}))
		sendMessage({ text: initialMessage })
		onMessageSent()
	}, [initialMessage])

	function send() {
		const trimmed = input.trim()
		if (!trimmed || isStreaming) return
		sendStartTimeRef.current = Date.now()
		pendingContextRef.current = openAssets.map((a) => ({
			id: a.id,
			title: a.title,
		}))
		sendMessage({ text: trimmed })
		setInput("")
		onMessageSent()
	}

	// isPanelExpanded is pure derived state — no useEffect, no async races.
	// Latest exchange: open by default (closedIds = user-collapsed ones).
	// Non-latest: closed by default (openIds = user-expanded ones).
	// When latestExchangeId changes, the old latest evaluates against openIds
	// (which doesn't contain it), so it collapses synchronously in the same render.
	function isPanelExpanded(exchangeId: string): boolean {
		if (exchangeId === latestExchangeId) return !closedIds.has(exchangeId)
		return openIds.has(exchangeId)
	}

	function togglePanel(exchangeId: string) {
		if (exchangeId === latestExchangeId) {
			setClosedIds((prev) => {
				const next = new Set(prev)
				if (next.has(exchangeId)) next.delete(exchangeId)
				else next.add(exchangeId)
				return next
			})
		} else {
			setOpenIds((prev) => {
				const next = new Set(prev)
				if (next.has(exchangeId)) next.delete(exchangeId)
				else next.add(exchangeId)
				return next
			})
		}
	}

	// Total conversation tokens + cost across all completed exchanges
	const conversationStats = useMemo(() => {
		let totalIn = 0
		let totalOut = 0
		for (const ex of exchanges) {
			const m = ex.assistantMsg?.metadata as
				| { usage?: { inputTokens?: number; outputTokens?: number } }
				| undefined
			totalIn += m?.usage?.inputTokens ?? 0
			totalOut += m?.usage?.outputTokens ?? 0
		}
		const pricing = getModelPricing(provider, detailedModel)
		const totalCost = pricing
			? (totalIn / 1_000_000) * pricing.input +
				(totalOut / 1_000_000) * pricing.output
			: null
		return { totalCost }
	}, [exchanges, provider, detailedModel])

	function getPanelData(exchange: Exchange): ExchangePanelData {
		const meta = exchange.assistantMsg?.metadata as
			| { usage?: { inputTokens?: number; outputTokens?: number } }
			| undefined
		const inputTokens = meta?.usage?.inputTokens ?? null
		const outputTokens = meta?.usage?.outputTokens ?? null
		const pricing = getModelPricing(provider, detailedModel)
		const costUsd =
			pricing != null && inputTokens != null && outputTokens != null
				? (inputTokens / 1_000_000) * pricing.input +
					(outputTokens / 1_000_000) * pricing.output
				: null

		// Extract user-facing tool names; hide internal generateMetadata tool
		const tools: string[] = []
		if (exchange.assistantMsg) {
			for (const part of exchange.assistantMsg.parts) {
				if (isToolUIPart(part)) {
					const name = getToolName(part)
					if (name !== "generateMetadata" && !tools.includes(name)) {
						tools.push(name)
					}
				}
			}
		}

		// Extract model-generated metadata from the generateMetadata tool part
		type MetadataInput = {
			suggestions: string[]
			chatTitle: string
			lastMessageSummary: string
		}
		const metaPart = exchange.assistantMsg?.parts.find(
			(p) => p.type === "tool-generateMetadata",
		) as { state: string; input?: MetadataInput } | undefined
		const metaInput =
			metaPart?.state === "input-available" ? metaPart.input : undefined

		// If assistant message exists but no metadata yet, fall back to hardcoded suggestions
		const suggestions = exchange.assistantMsg
			? (metaInput?.suggestions ?? FALLBACK_SUGGESTIONS)
			: null

		return {
			model: detailedModel,
			inputTokens,
			outputTokens,
			costUsd,
			totalConversationCostUsd: conversationStats.totalCost,
			durationMs: exchangeDurations[exchange.id] ?? null,
			ttftMs: exchangeTtfts[exchange.id] ?? null,
			context: exchangeContextSnapshots[exchange.id] ?? [],
			tools,
			sources: [],
			suggestions,
			chatTitle: metaInput?.chatTitle ?? null,
			lastMessageSummary: metaInput?.lastMessageSummary ?? null,
		}
	}

	return (
		<div className="flex flex-1 min-h-0 flex-col overflow-hidden">
			<div
				ref={scrollContainerRef}
				className="min-h-0 flex-1 overflow-y-auto p-3"
			>
				{exchanges.length === 0 ? (
					<p className="py-12 text-center text-sm text-muted-foreground">
						No messages yet. Start the conversation below.
					</p>
				) : (
					exchanges.map((exchange) => {
						const isLatest = exchange.id === latestExchangeId
						const showSpacer = isLatest && isStreaming
						// Extract as local const so TypeScript narrows correctly in callbacks
						const assistantMsg = exchange.assistantMsg

						return (
							<Fragment key={exchange.id}>
								{/* User message */}
								<div
									ref={isLatest ? lastUserMsgRef : null}
									className="flex justify-end px-3 pt-3"
								>
									<div className="max-w-[88%] font-medium  px-3 py-2 pb-6 text-sm text-foreground">
										{exchange.userMsg.parts.map((part, i) => {
											if (part.type !== "text") return null
											return (
												// biome-ignore lint/suspicious/noArrayIndexKey: parts are stable ordered array
												<span key={i}>{part.text}</span>
											)
										})}
									</div>
								</div>

								{/* Assistant message */}
								{assistantMsg !== null && (
									<div className="flex justify-start px-3 pt-3 pb-2">
										<div className="prose prose-sm tracking-tight leading-normalS max-w-[88%] dark:prose-invert [&_h1]:text-[17px] [&_h1]:font-bold [&_h1]:mb-1.5 [&_h1]:mt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mb-1 [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mb-0.5 [&_h3]:mt-2 [&_hr]:my-3 [&_hr]:border-border/40 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5">
											{assistantMsg.parts.map((part, i) => {
												if (part.type !== "text") return null
												const isLastPart = i === assistantMsg.parts.length - 1
												return (
													<Streamdown
														// biome-ignore lint/suspicious/noArrayIndexKey: parts are stable ordered array
														key={i}
														isAnimating={isStreaming && isLatest && isLastPart}
													>
														{part.text}
													</Streamdown>
												)
											})}
										</div>
									</div>
								)}

								{/* StreamingSpacer during streaming, ExchangePanel after.
								    Both use minHeight=containerHeight — no layout shift on swap. */}
								{showSpacer ? (
									<StreamingSpacer minHeight={containerHeight} />
								) : (
									<ExchangePanel
										data={getPanelData(exchange)}
										isExpanded={isPanelExpanded(exchange.id)}
										minHeight={containerHeight}
										onToggle={() => togglePanel(exchange.id)}
										onSuggestion={(text) => {
											setInput(text)
											textareaRef.current?.focus()
										}}
									/>
								)}
							</Fragment>
						)
					})
				)}
			</div>
			<ChatInputBar
				openAssets={openAssets}
				onRemoveAsset={onRemoveAsset}
				onOpenAsset={onOpenAsset}
				input={input}
				onInputChange={setInput}
				onSend={send}
				disabled={isStreaming}
				textareaRef={textareaRef}
			/>
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
	onOpenAsset: (id: string) => void
	initialMessage?: string | null
	projectId: string
	provider: string
	apiKey: string
	detailedModel: string
	onTitleUpdate: (title: string) => void
	onMessageSent: () => void
}) {
	const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
		null,
	)

	useEffect(() => {
		setInitialMessages(null)
		api.chats
			.getMessages(chatId, rest.projectId)
			.then((msgs) =>
				setInitialMessages(
					msgs.map((m) => ({
						id: m.id,
						role: m.role,
						parts: m.parts as UIMessage["parts"],
						metadata: m.metadata,
						createdAt: new Date(m.createdAt),
					})),
				),
			)
			.catch(() => setInitialMessages([]))
	}, [chatId])

	if (initialMessages === null) {
		return (
			<div className="flex h-full items-center justify-center">
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
	detailedModel,
	onNewChat,
	onCloseChat,
	onSetActiveChat,
	onSendInAgentPat,
	onRemoveAsset,
	onOpenAsset,
	onOpenSettings,
	onChatTitleUpdate,
	onMessageSent,
}: {
	chats: ApiChat[]
	openChatIds: string[]
	activeChatId: string
	openAssets: ApiAsset[]
	pendingMessages: Record<string, string>
	projectId: string
	provider: string
	apiKey: string
	detailedModel: string
	onNewChat: () => void
	onCloseChat: (id: string) => void
	onSetActiveChat: (id: string) => void
	onSendInAgentPat: (message: string) => void
	onRemoveAsset: (id: string) => void
	onOpenAsset: (id: string) => void
	onOpenSettings: () => void
	onChatTitleUpdate: (chatId: string, title: string) => void
	onMessageSent: (chatId: string) => void
}) {
	const { connectedToAI } = useAI()
	const openChats = openChatIds
		.map((id) => chats.find((c) => c.id === id))
		.filter(Boolean) as ApiChat[]
	const activeChat = openChats.find((c) => c.id === activeChatId)

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Tab bar */}
			<div className="relative flex h-8 shrink-0 items-end gap-0.5 bg-muted px-1">
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />

				{/* Open chat tabs — AgentPat first so all tabs share the same flex context */}
				<div className="tab-scroll flex flex-1 items-end h-6 gap-0.5 overflow-x-auto">
					{openChats.map((chat) => (
						<div
							key={chat.id}
							className={cn(
								"group/tab relative flex shrink-0 items-center gap-1 self-stretch pl-3 pr-1 text-xs transition-colors cursor-default rounded-t-sm",
								activeChatId === chat.id
									? "border-t-2 border-primary shadow-sm bg-background text-foreground"
									: "border-t-2 border-primary/30 shadow-sm text-muted-foreground hover:text-foreground",
							)}
						>
							<button
								type="button"
								onClick={() => onSetActiveChat(chat.id)}
								className="max-w-[120px] truncate cursor-pointer font-medium"
							>
								{chat.title}
							</button>
							<button
								type="button"
								onClick={() => onCloseChat(chat.id)}
								className="shrink-0 opacity-0 transition-opacity group-hover/tab:opacity-100"
							>
								<X size={8} />
							</button>
						</div>
					))}
				</div>

				{/* Plus — new chat */}
				<div className="relative z-10 flex shrink-0 items-center rounded-t-md border border-b-0 border-transparent text-muted-foreground transition-colors hover:text-foreground">
					<Button
						variant="ghost"
						size="icon"
						onClick={onNewChat}
						title="New chat"
						disabled={!connectedToAI || !projectId}
					>
						<Plus size={12} />
					</Button>
				</div>
			</div>

			{/* Content */}
			{!connectedToAI ? (
				<div className="flex flex-1 min-h-0 items-center justify-center">
					<Empty>
						<EmptyHeader>
							<EmptyTitle>AgentPat</EmptyTitle>
							<EmptyDescription>
								Connect an AI provider in Settings to start using AgentPat.
							</EmptyDescription>
						</EmptyHeader>
						<Button size="sm" variant="outline" onClick={onOpenSettings}>
							Settings
						</Button>
					</Empty>
				</div>
			) : activeChatId === "agentpat" || !activeChat ? (
				<AgentPatPane
					onSend={onSendInAgentPat}
					openAssets={openAssets}
					onRemoveAsset={onRemoveAsset}
					onOpenAsset={onOpenAsset}
				/>
			) : (
				<ChatPaneLoader
					key={activeChat.id}
					chatId={activeChat.id}
					openAssets={openAssets}
					onRemoveAsset={onRemoveAsset}
					onOpenAsset={onOpenAsset}
					initialMessage={pendingMessages[activeChat.id] ?? null}
					projectId={projectId}
					provider={provider}
					apiKey={apiKey}
					detailedModel={detailedModel}
					onTitleUpdate={(title) => onChatTitleUpdate(activeChat.id, title)}
					onMessageSent={() => onMessageSent(activeChat.id)}
				/>
			)}
		</div>
	)
}
