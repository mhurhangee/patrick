import { useChat } from "@ai-sdk/react"
import {
	type ApiAsset,
	type ApiChat,
	CONTEXT_OVERFLOW_MARKER,
	contextWindowFor,
	MODELS_BY_ID,
	type OpenDoc,
} from "@patrickos/shared"
import {
	DefaultChatTransport,
	getToolName,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai"
import { ArrowUp, ChevronDown, Loader2, Plus, Square, X } from "lucide-react"
import {
	type RefObject,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { Streamdown } from "streamdown"
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
import { api, BASE_URL } from "@/lib/api"
import { assetLabel, cn } from "@/lib/utils"
import { AssistantParts, type ToolContext } from "./chat-message-parts"
import { ChatOverflowNotice } from "./chat-overflow-notice"
import { ContextRing } from "./context-ring"
import { ExchangePanel, type ExchangePanelData } from "./exchange-panel"

// ─── Data ─────────────────────────────────────────────────────────────────────

function getModelPricing(_provider: string, modelId: string) {
	// IDs are unique across providers (vendor-prefixed), so a flat lookup works.
	return MODELS_BY_ID[modelId]?.pricingPerM ?? null
}

// ─── Shared input bar ─────────────────────────────────────────────────────────

function ChatInputBar({
	openAssets,
	onRemoveAsset,
	onOpenAsset,
	doNotRead,
	input,
	onInputChange,
	onSend,
	disabled,
	isStreaming,
	onStop,
	textareaRef,
	modelId,
	lastInputTokens,
}: {
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	onOpenAsset: (id: string) => void
	doNotRead?: Set<string>
	input: string
	onInputChange: (value: string) => void
	onSend: () => void
	disabled?: boolean
	isStreaming?: boolean
	onStop?: () => void
	textareaRef?: RefObject<HTMLTextAreaElement | null>
	modelId?: string
	lastInputTokens?: number | null
}) {
	// Only show docs actually sent to the AI — excluded ("do not read") are hidden.
	const visible = openAssets.filter((a) => !doNotRead?.has(a.id))

	// Context-usage ring: the actual input tokens the model reported last turn.
	// Hidden until the first turn (no measurement to show yet).
	const showRing = modelId != null && lastInputTokens != null
	const inputPrice = modelId ? MODELS_BY_ID[modelId]?.pricingPerM?.input : null
	const inputCostPerTurn =
		inputPrice != null && lastInputTokens != null
			? (lastInputTokens / 1_000_000) * inputPrice
			: null
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
					className="min-h-[64px] resize-none rounded-none border-0 bg-transparent p-3 text-sm shadow-none focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100 dark:bg-transparent dark:disabled:bg-transparent"
				/>

				<div className="flex justify-between px-3 pb-2">
					{visible.length === 0 ? (
						<span className="select-none pl-1 text-xxs text-muted-foreground/40 pt-2">
							Open docs are sent to the AI
						</span>
					) : (
						<div className="flex flex-wrap items-center gap-1">
							{visible.map((asset) => (
								<span
									key={asset.id}
									className="group/chip inline-flex items-center gap-1"
								>
									<button
										type="button"
										onClick={() => onOpenAsset(asset.id)}
										className={cn(
											"cursor-pointer truncate text-xxs font-medium text-muted-foreground hover:text-foreground",
											asset.kind === "artifact" && "capitalize",
										)}
									>
										{assetLabel(asset)}
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
					<div className="flex items-center gap-2">
						{showRing && modelId ? (
							<ContextRing
								used={lastInputTokens ?? 0}
								window={contextWindowFor(modelId)}
								inputCostPerTurn={inputCostPerTurn}
							/>
						) : null}
						{isStreaming ? (
							<Button
								size="icon"
								variant="secondary"
								onClick={onStop}
								aria-label="Stop generating"
							>
								<Square />
							</Button>
						) : (
							<Button
								size="icon"
								onClick={onSend}
								disabled={disabled || !input.trim()}
								aria-label="Send message"
							>
								<ArrowUp />
							</Button>
						)}
					</div>
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
	doNotRead,
	focusNonce,
}: {
	onSend: (message: string) => void
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	onOpenAsset: (id: string) => void
	doNotRead: Set<string>
	focusNonce: number
}) {
	const [input, setInput] = useState("")
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	// Focus the composer on mount and whenever "New chat" is pressed again
	// (the nonce changes even when the composer is already showing).
	// biome-ignore lint/correctness/useExhaustiveDependencies: focusNonce is an intentional re-trigger
	useEffect(() => {
		textareaRef.current?.focus()
	}, [focusNonce])

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
				doNotRead={doNotRead}
				input={input}
				onInputChange={setInput}
				onSend={send}
				textareaRef={textareaRef}
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
	doNotRead,
	onOpenFile,
	initialMessages,
	initialMessage,
	taskId,
	provider,
	apiKey,
	detailedModel,
	onNewChat,
	onNewChatWithSummary,
	onForkChat,
}: {
	chatId: string
	openAssets: ApiAsset[]
	onRemoveAsset: (id: string) => void
	onOpenAsset: (id: string) => void
	doNotRead: Set<string>
	onOpenFile: (filename: string) => void
	initialMessages: UIMessage[]
	initialMessage?: string | null
	taskId: string
	provider: string
	apiKey: string
	detailedModel: string
	onNewChat: () => void
	onNewChatWithSummary: (summary: string) => void
	onForkChat: (sourceChatId: string, uptoMessageId: string) => void
}) {
	// What the attorney has open IS the AI's context (OPEN=CONTEXT). Exclude any
	// "do not read" docs. Mode is "both" for now — the per-doc toggle lands next.
	const openDocsRef = useRef<OpenDoc[]>([])
	openDocsRef.current = openAssets
		.filter((a) => !doNotRead.has(a.id))
		.map((a) => ({ path: a.path, kind: a.kind }))
	// Excluded source paths — sent so the server can block the agent's tools too.
	const excludedPathsRef = useRef<string[]>([])
	excludedPathsRef.current = Array.from(doNotRead)

	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const lastUserMsgRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [containerHeight, setContainerHeight] = useState(400)
	const [atBottom, setAtBottom] = useState(true)
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

	const {
		messages,
		sendMessage,
		status,
		stop,
		addToolOutput,
		error,
		regenerate,
		setMessages,
	} = useChat({
		transport: new DefaultChatTransport({
			api: `${BASE_URL}/chats/${chatId}/messages`,
			body: { taskPath: taskId, provider, apiKey, detailedModel },
			prepareSendMessagesRequest: ({ body, messages: uiMessages, id }) => ({
				body: {
					...body,
					id,
					messages: uiMessages,
					openDocs: openDocsRef.current,
					excludedPaths: excludedPathsRef.current,
				},
			}),
		}),
		messages: initialMessages,
		// After the user answers a client-side tool (e.g. extractSource), resubmit
		// so the agent continues with the tool result.
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
	})

	const toolCtx: ToolContext = {
		provider,
		apiKey,
		model: detailedModel,
		taskId,
		addToolOutput: (args) =>
			addToolOutput(args as Parameters<typeof addToolOutput>[0]),
		onOpenFile,
	}

	const isStreaming = status === "streaming" || status === "submitted"
	const showOverflowNotice = Boolean(
		error?.message.includes(CONTEXT_OVERFLOW_MARKER),
	)
	const [summarising, setSummarising] = useState(false)
	// Summarise this (overflowed) chat, then open a fresh one primed with it.
	// If even the summary request overflows, fall back to a blank new chat.
	async function startSummaryChat() {
		setSummarising(true)
		try {
			const { summary } = await api.chats.summarize(
				chatId,
				taskId,
				provider,
				apiKey,
				detailedModel,
			)
			if (summary.trim()) onNewChatWithSummary(summary)
			else onNewChat()
		} catch {
			onNewChat()
		} finally {
			setSummarising(false)
		}
	}

	// Focus the input on mount so a freshly opened chat (incl. a fork) is ready
	// to type in.
	useEffect(() => {
		textareaRef.current?.focus()
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

	// Group flat messages into exchanges: one user message + all the assistant
	// messages that follow it (a client-side tool confirmation can split the
	// assistant's turn into more than one message). Merge their parts so the tool
	// card and the post-confirmation answer render together under one exchange.
	const exchanges = useMemo<Exchange[]>(() => {
		const result: Exchange[] = []
		let i = 0
		while (i < messages.length) {
			const msg = messages[i]
			if (msg.role === "user") {
				i++
				let first: UIMessage | null = null
				let last: UIMessage | null = null
				const parts: UIMessage["parts"] = []
				while (i < messages.length && messages[i].role === "assistant") {
					const a = messages[i]
					first ??= a
					last = a
					parts.push(...a.parts)
					i++
				}
				const assistantMsg: UIMessage | null = first
					? { ...first, parts, metadata: last?.metadata }
					: null
				result.push({ id: msg.id, userMsg: msg, assistantMsg })
			} else {
				i++
			}
		}
		return result
	}, [messages])

	const latestExchangeId = exchanges.at(-1)?.id

	// Scroll latest user message to top on new send — not on initial history load.
	// useLayoutEffect fires before paint so there's no flash of the old position.
	// Seed from the last loaded exchange so history doesn't scroll/snapshot on
	// mount — but a fresh chat starts undefined, so its first sent message does.
	const prevLatestExchangeIdRef = useRef<string | undefined>(
		initialMessages.filter((m) => m.role === "user").at(-1)?.id,
	)
	useLayoutEffect(() => {
		if (!latestExchangeId) return
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

	// Re-check scroll position as content streams in, so the scroll-to-bottom
	// button appears when a response grows below the fold (not just on scroll).
	// biome-ignore lint/correctness/useExhaustiveDependencies: handleScroll reads refs; recheck when messages change
	useEffect(() => {
		handleScroll()
	}, [messages])

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
		pendingContextRef.current = openAssets
			.filter((a) => !doNotRead.has(a.id))
			.map((a) => ({ id: a.id, title: a.title }))
		sendMessage({ text: initialMessage })
	}, [initialMessage])

	function handleScroll() {
		const el = scrollContainerRef.current
		if (!el) return
		setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
	}

	const textOf = (msg: UIMessage | null) =>
		(msg?.parts ?? [])
			.filter((p) => p.type === "text")
			.map((p) => (p as { text: string }).text)
			.join("\n")

	function copyResponse(exchange: Exchange) {
		const text = textOf(exchange.assistantMsg)
		if (text) navigator.clipboard.writeText(text)
	}

	// Edit = redo: drop this exchange (and anything after) and put the prompt
	// back in the input to tweak and resend. Fork preserves the original branch.
	function editExchange(exchange: Exchange) {
		const idx = messages.findIndex((m) => m.id === exchange.userMsg.id)
		if (idx !== -1) setMessages(messages.slice(0, idx))
		setInput(textOf(exchange.userMsg))
		textareaRef.current?.focus()
	}

	function scrollToBottom() {
		const el = scrollContainerRef.current
		if (!el) return
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
	}

	function send() {
		const trimmed = input.trim()
		if (!trimmed || isStreaming) return
		sendStartTimeRef.current = Date.now()
		pendingContextRef.current = openAssets
			.filter((a) => !doNotRead.has(a.id))
			.map((a) => ({ id: a.id, title: a.title }))
		sendMessage({ text: trimmed })
		setInput("")
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

	// Context ring: the provider's actual input-token count from the most recent
	// assistant turn (what the model ingested — docs, history, system, tools).
	const lastInputTokens = useMemo(() => {
		let last: number | null = null
		for (const m of messages) {
			const meta = m.metadata as
				| { usage?: { inputTokens?: number } }
				| undefined
			if (m.role === "assistant" && meta?.usage?.inputTokens != null) {
				last = meta.usage.inputTokens
			}
		}
		return last
	}, [messages])

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

		const tools: string[] = []
		if (exchange.assistantMsg) {
			for (const part of exchange.assistantMsg.parts) {
				if (isToolUIPart(part)) {
					const name = getToolName(part)
					if (!tools.includes(name)) tools.push(name)
				}
			}
		}

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
		}
	}

	return (
		<div className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
			<div className="relative min-h-0 flex-1">
				<div
					ref={scrollContainerRef}
					onScroll={handleScroll}
					className="h-full overflow-y-auto p-3"
				>
					{exchanges.length === 0 ? (
						<p className="py-12 text-center text-sm text-muted-foreground">
							No messages yet. Start the conversation below.
						</p>
					) : (
						exchanges.map((exchange) => {
							const isLatest = exchange.id === latestExchangeId
							const streaming = isLatest && isStreaming
							// Extract as local const so TypeScript narrows correctly in callbacks
							const assistantMsg = exchange.assistantMsg
							// Pre-first-token: nothing from the assistant yet.
							const assistantEmpty =
								!assistantMsg || assistantMsg.parts.length === 0

							return (
								// The latest exchange gets a one-viewport min-height so its user
								// message can scroll to the top — without a trailing spacer you
								// could scroll past into blank space.
								<div
									key={exchange.id}
									style={
										isLatest ? { minHeight: containerHeight - 24 } : undefined
									}
								>
									{/* User message */}
									<div
										ref={isLatest ? lastUserMsgRef : null}
										className="flex justify-end px-3 pt-3"
									>
										<div className="prose prose-sm tracking-tight max-w-[88%] px-3 pb-6 text-sm font-medium text-foreground dark:prose-invert [&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1.5 [&_ul]:my-1.5">
											{exchange.userMsg.parts.map((part, i) => {
												if (part.type !== "text") return null
												return (
													// biome-ignore lint/suspicious/noArrayIndexKey: parts are stable ordered array
													<Streamdown key={i}>{part.text}</Streamdown>
												)
											})}
										</div>
									</div>

									{/* Assistant message */}
									{assistantMsg !== null && (
										<div className="flex justify-start px-3 pt-3 pb-2">
											<div className="prose prose-sm tracking-tight leading-normalS max-w-[88%] dark:prose-invert [&_h1]:text-[17px] [&_h1]:font-bold [&_h1]:mb-1.5 [&_h1]:mt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mb-1 [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mb-0.5 [&_h3]:mt-2 [&_hr]:my-3 [&_hr]:border-border/40 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5">
												<AssistantParts
													parts={assistantMsg.parts}
													isStreaming={isStreaming}
													isLatest={isLatest}
													ctx={toolCtx}
												/>
											</div>
										</div>
									)}

									{/* Pre-first-token indicator — gone once any content streams in. */}
									{streaming && assistantEmpty && (
										<div className="px-5 pt-2">
											<span className="animate-pulse text-xs text-muted-foreground/40">
												Thinking…
											</span>
										</div>
									)}

									{/* Audit summary — only once the response is complete. */}
									{assistantMsg !== null && !streaming && (
										<ExchangePanel
											data={getPanelData(exchange)}
											isExpanded={isPanelExpanded(exchange.id)}
											onToggle={() => togglePanel(exchange.id)}
											onCopy={() => copyResponse(exchange)}
											onFork={() =>
												onForkChat(
													chatId,
													assistantMsg.id ?? exchange.userMsg.id,
												)
											}
											onEdit={
												isLatest ? () => editExchange(exchange) : undefined
											}
											onRetry={isLatest ? () => regenerate() : undefined}
										/>
									)}
								</div>
							)
						})
					)}
				</div>
				{!atBottom && (
					<button
						type="button"
						onClick={scrollToBottom}
						aria-label="Scroll to bottom"
						className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-background p-1.5 text-muted-foreground shadow-md transition-colors hover:text-foreground"
					>
						<ChevronDown size={16} />
					</button>
				)}
			</div>
			{showOverflowNotice ? (
				<ChatOverflowNotice
					onNewChat={onNewChat}
					onSummarise={startSummaryChat}
					summarising={summarising}
				/>
			) : error ? (
				<p className="mx-3 mb-3 text-xs text-muted-foreground">
					Something went wrong generating a response — please try again.
				</p>
			) : null}
			<ChatInputBar
				openAssets={openAssets}
				onRemoveAsset={onRemoveAsset}
				onOpenAsset={onOpenAsset}
				doNotRead={doNotRead}
				input={input}
				onInputChange={setInput}
				onSend={send}
				disabled={isStreaming}
				isStreaming={isStreaming}
				onStop={stop}
				textareaRef={textareaRef}
				modelId={detailedModel}
				lastInputTokens={lastInputTokens}
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
	doNotRead: Set<string>
	onOpenFile: (filename: string) => void
	initialMessage?: string | null
	taskId: string
	provider: string
	apiKey: string
	detailedModel: string
	onNewChat: () => void
	onNewChatWithSummary: (summary: string) => void
	onForkChat: (sourceChatId: string, uptoMessageId: string) => void
}) {
	const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
		null,
	)

	useEffect(() => {
		setInitialMessages(null)
		api.chats
			.getMessages(chatId, rest.taskId)
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
	}, [chatId, rest.taskId])

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
	composerFocusNonce,
	taskId,
	provider,
	apiKey,
	detailedModel,
	onNewChat,
	onNewChatWithSummary,
	onForkChat,
	onCloseChat,
	onSetActiveChat,
	onSendInAgentPat,
	onRemoveAsset,
	onOpenAsset,
	doNotRead,
	onOpenFile,
	onOpenSettings,
}: {
	chats: ApiChat[]
	openChatIds: string[]
	activeChatId: string
	openAssets: ApiAsset[]
	pendingMessages: Record<string, string>
	composerFocusNonce: number
	taskId: string
	provider: string
	apiKey: string
	detailedModel: string
	onNewChat: () => void
	onNewChatWithSummary: (summary: string) => void
	onForkChat: (sourceChatId: string, uptoMessageId: string) => void
	onCloseChat: (id: string) => void
	onSetActiveChat: (id: string) => void
	onSendInAgentPat: (message: string) => void
	onRemoveAsset: (id: string) => void
	onOpenAsset: (id: string) => void
	doNotRead: Set<string>
	onOpenFile: (filename: string) => void
	onOpenSettings: () => void
}) {
	const { connectedToAI } = useAI()
	const openChats = openChatIds
		.map((id) => chats.find((c) => c.id === id))
		.filter(Boolean) as ApiChat[]
	const activeChat = openChats.find((c) => c.id === activeChatId)

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Tab bar */}
			<div className="relative flex h-7 shrink-0 items-end bg-muted  px-1">
				{/* Open chat tabs — AgentPat first so all tabs share the same flex context */}
				<div className="tab-scroll flex flex-1 items-end h-6 overflow-x-auto">
					{openChats.map((chat) => (
						<div
							key={chat.id}
							className={cn(
								"group/tab relative flex shrink-0 items-center self-stretch pl-3 pr-1 text-xs transition-colors cursor-default",
								activeChatId === chat.id
									? "border-t-2 border-primary shadow-sm bg-background text-foreground"
									: "border-t-2 border-primary/30 bg-muted shadow-sm text-muted-foreground hover:text-foreground",
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
						disabled={!connectedToAI || !taskId}
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
					doNotRead={doNotRead}
					focusNonce={composerFocusNonce}
				/>
			) : (
				<ChatPaneLoader
					key={activeChat.id}
					chatId={activeChat.id}
					openAssets={openAssets}
					onRemoveAsset={onRemoveAsset}
					onOpenAsset={onOpenAsset}
					doNotRead={doNotRead}
					onOpenFile={onOpenFile}
					initialMessage={pendingMessages[activeChat.id] ?? null}
					taskId={taskId}
					provider={provider}
					apiKey={apiKey}
					detailedModel={detailedModel}
					onNewChat={onNewChat}
					onNewChatWithSummary={onNewChatWithSummary}
					onForkChat={onForkChat}
				/>
			)}
		</div>
	)
}
