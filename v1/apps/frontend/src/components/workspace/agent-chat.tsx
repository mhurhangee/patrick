import { useChat } from "@ai-sdk/react";
import { useDocxAgentTools } from "@eigenpal/docx-editor-agents/react";
import type { DocxEditorRef } from "@eigenpal/docx-editor-react";
import {
	type Chat,
	contextWindowFor,
	type ExchangeContext,
	type ExchangeMetadata,
	MODELS_BY_ID,
	type PinnedSource,
} from "@patrick/shared";
import {
	DefaultChatTransport,
	getToolName,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai";
import { ChevronDown, Loader2, SendHorizontal, Square } from "lucide-react";
import {
	type RefObject,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { BASE_URL } from "@/api/client";
import { tasksApi } from "@/api/tasks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRefreshChats, useStoredChat } from "@/hooks/use-chats";
import { useProfile } from "@/hooks/use-profiles";
import {
	useCreateDocument,
	useSaveDocuments,
	useTaskDocuments,
	useUnlockDocument,
} from "@/hooks/use-tasks";
import { useActiveChat } from "@/lib/active-chat";
import { useEditorRefFor } from "@/lib/active-editor";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { useWorkspace, type WorkspaceDoc } from "@/lib/workspace";
import {
	AssistantParts,
	HITL_TOOLS,
	type ToolUiHandlers,
} from "./chat-message-parts";
import { ContextRing } from "./context-ring";
import { ExchangePanel, type ExchangePanelData } from "./exchange-panel";
import { SystemCard } from "./system-card";

// One user message + every assistant message that follows it (the loop produces
// several — one per tool round-trip), merged for rendering with aggregated usage.
type Exchange = {
	id: string;
	userMsg: UIMessage;
	assistantMsg: UIMessage | null;
	inputTokens: number | null;
	outputTokens: number | null;
	context: ExchangeContext | null;
	tools: string[];
};

function pricingFor(modelId: string | null | undefined) {
	return modelId ? (MODELS_BY_ID[modelId]?.pricingPerM ?? null) : null;
}

function costOf(
	modelId: string | null | undefined,
	inTok: number | null,
	outTok: number | null,
): number | null {
	const p = pricingFor(modelId);
	if (!p || inTok == null || outTok == null) return null;
	return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
}

function textOf(msg: UIMessage | null): string {
	return (msg?.parts ?? [])
		.filter((p) => p.type === "text")
		.map((p) => (p as { text: string }).text)
		.join("\n");
}

// Loads the active chat's persisted state, then mounts a session keyed by its id
// so switching chats remounts with fresh history.
export function AgentChat() {
	const { activeTaskId } = useActiveTask();
	const { activeChatId } = useActiveChat();
	const { data: stored, isLoading } = useStoredChat(activeTaskId, activeChatId);

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2 className="size-4 animate-spin text-muted-foreground" />
			</div>
		);
	}
	return (
		<ChatSession
			key={activeChatId}
			chatId={activeChatId}
			initial={stored ?? null}
		/>
	);
}

function ChatSession({
	chatId,
	initial,
}: {
	chatId: string;
	initial: Chat | null;
}) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { newChat, selectChat } = useActiveChat();
	const { data: profile } = useProfile(activeProfileId);
	const modelId = profile?.ai.detailedModel ?? null;
	const profileTemplate = profile?.prompts.agentpat ?? "";
	const refreshChats = useRefreshChats(activeTaskId);
	const { data: docs } = useTaskDocuments(activeTaskId);
	const saveDocs = useSaveDocuments(activeTaskId ?? "");
	const createDoc = useCreateDocument(activeTaskId ?? "");
	const unlockDoc = useUnlockDocument(activeTaskId ?? "");
	const docsRef = useRef(docs);
	docsRef.current = docs;
	const { columnList, focused, getDoc, open } = useWorkspace();

	// This chat's instructions. null ⇒ "follow the profile" (so editing the
	// profile prompt updates a fresh chat live); a non-null value is this chat's
	// own edit (a loaded chat seeds from its locked template). Frozen at first
	// send (one system per chat).
	const [chatTemplate, setChatTemplate] = useState<string | null>(
		initial?.systemTemplate ?? null,
	);
	const template = chatTemplate ?? profileTemplate;

	// Seed messages from the persisted chat (empty for a new one).
	const initialMessages = useMemo<UIMessage[]>(
		() =>
			(initial?.messages ?? []).map((m) => ({
				id: m.id,
				role: m.role,
				parts: m.parts as UIMessage["parts"],
				metadata: m.metadata,
			})),
		[initial],
	);

	// Read-only sources currently open in the viewer. Opening one pins it to the
	// chat (OPEN = CONTEXT); see the accumulation below.
	const openSources = useMemo<PinnedSource[]>(() => {
		const ids = columnList.flatMap((c) => c.tabs);
		return ids
			.map((id) => getDoc(id))
			.filter((d): d is WorkspaceDoc => d != null && !d.editable)
			.map((d) => ({ filename: d.id, kind: d.kind }));
	}, [columnList, getDoc]);

	// Pinned sources are append-only for the chat's life: once a source is opened
	// it stays in context even if its tab is closed (start a new chat to reset).
	// Seeded from the persisted chat when reopening one.
	const [pinnedSources, setPinnedSources] = useState<PinnedSource[]>(
		initial?.pinnedSources ?? [],
	);
	useEffect(() => {
		setPinnedSources((prev) => {
			const seen = new Set(prev.map((p) => p.filename));
			const additions = openSources.filter((s) => !seen.has(s.filename));
			return additions.length ? [...prev, ...additions] : prev;
		});
	}, [openSources]);

	// Patrick edits ONE live draft at a time (the editor tools bind to a single
	// editor). The active draft is sticky: the focused editable doc, else the one
	// you were last editing, else any open editable doc — so it doesn't vanish
	// when you focus a source to read it. It's not in the static context; the
	// agent reads it live via the editor tools.
	const focusedDoc = focused ? getDoc(focused) : undefined;
	const openEditableIds = useMemo(() => {
		return columnList
			.flatMap((c) => c.tabs)
			.map((id) => getDoc(id))
			.filter((d): d is WorkspaceDoc => !!d?.editable)
			.map((d) => d.id);
	}, [columnList, getDoc]);
	const [activeDraft, setActiveDraft] = useState<string | null>(null);
	useEffect(() => {
		setActiveDraft((prev) => {
			if (focusedDoc?.editable) return focusedDoc.id;
			if (prev && openEditableIds.includes(prev)) return prev;
			return openEditableIds[0] ?? null;
		});
	}, [focusedDoc, openEditableIds]);
	const editorRef = useEditorRefFor(activeDraft);

	const { executeToolCall } = useDocxAgentTools({
		editorRef: editorRef as RefObject<DocxEditorRef | null>,
		author: "Patrick",
	});

	// Refs so the transport/onToolCall always read the latest without re-creating
	// the chat instance.
	const pinnedRef = useRef(pinnedSources);
	pinnedRef.current = pinnedSources;
	const activeDraftRef = useRef(activeDraft);
	activeDraftRef.current = activeDraft;
	const profileIdRef = useRef(activeProfileId);
	profileIdRef.current = activeProfileId;
	const templateRef = useRef(template);
	templateRef.current = template;
	const refreshChatsRef = useRef(refreshChats);
	refreshChatsRef.current = refreshChats;

	const {
		messages,
		sendMessage,
		status,
		stop,
		addToolResult,
		regenerate,
		setMessages,
	} = useChat({
		messages: initialMessages,
		transport: new DefaultChatTransport({
			api: `${BASE_URL}/tasks/${activeTaskId}/chat`,
			prepareSendMessagesRequest: ({ messages: msgs }) => ({
				body: {
					messages: msgs,
					chatId,
					profileId: profileIdRef.current,
					pinnedSources: pinnedRef.current,
					activeDraft: activeDraftRef.current,
					templateOverride: templateRef.current,
				},
			}),
		}),
		// After a client tool resolves, resubmit so the agent loop continues.
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		async onToolCall({ toolCall }) {
			// HITL tools (requestOpenFile) are resolved by their card, not here.
			if (HITL_TOOLS.has(toolCall.toolName)) return;
			let output: unknown;
			try {
				output = executeToolCall(
					toolCall.toolName,
					toolCall.input as Record<string, unknown>,
				);
			} catch (err) {
				output = {
					success: false,
					error: err instanceof Error ? err.message : "tool execution failed",
				};
			}
			addToolResult({
				tool: toolCall.toolName,
				toolCallId: toolCall.toolCallId,
				output,
			});
		},
	});

	const [input, setInput] = useState("");
	const canSend = !!activeTaskId && !!activeProfileId;
	const isStreaming = status === "streaming" || status === "submitted";
	// The agent loop spans multiple requests (one per client tool round-trip).
	// `status` dips to "ready" between them, so the SDK's own auto-continue
	// predicate keeps us "busy" across the gaps (no blank UI mid-loop).
	const busy =
		isStreaming || lastAssistantMessageIsCompleteWithToolCalls({ messages });
	const pending = busy ? activityLabel(status, messages.at(-1)) : null;

	// Handlers for HITL tool cards (requestOpenFile): resolve the tool call +
	// pin the accepted source into this chat's context.
	const toolHandlers = useMemo<ToolUiHandlers>(
		() => ({
			addToolResult: (args) =>
				addToolResult(args as Parameters<typeof addToolResult>[0]),
			pinSource: (filename) => {
				const kind = filename.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
				setPinnedSources((prev) =>
					prev.some((p) => p.filename === filename)
						? prev
						: [...prev, { filename, kind }],
				);
				// Show what got added — open it in the viewer too.
				open(filename);
			},
			setLabel: (filename, label) => {
				const list = docsRef.current;
				if (!list) return;
				saveDocs.mutate(
					list.map((d) => (d.filename === filename ? { ...d, label } : d)),
				);
			},
			createDraft: async (name) => {
				const res = await createDoc.mutateAsync(name);
				open(res.filename);
				return res.filename;
			},
			unlockSource: async (filename) => {
				const res = await unlockDoc.mutateAsync(filename);
				open(res.filename);
				return res.filename;
			},
		}),
		[
			addToolResult,
			open,
			saveDocs.mutate,
			createDoc.mutateAsync,
			unlockDoc.mutateAsync,
		],
	);

	// Group the flat message list into exchanges, aggregating usage/tools/context.
	const exchanges = useMemo<Exchange[]>(() => {
		const result: Exchange[] = [];
		let i = 0;
		while (i < messages.length) {
			const msg = messages[i];
			if (msg?.role !== "user") {
				i++;
				continue;
			}
			i++;
			let first: UIMessage | null = null;
			const parts: UIMessage["parts"] = [];
			let inTok = 0;
			let outTok = 0;
			let hasUsage = false;
			let context: ExchangeContext | null = null;
			const tools: string[] = [];
			while (i < messages.length && messages[i]?.role === "assistant") {
				const a = messages[i] as UIMessage;
				first ??= a;
				parts.push(...a.parts);
				const meta = a.metadata as ExchangeMetadata | undefined;
				if (meta?.usage) {
					inTok += meta.usage.inputTokens ?? 0;
					outTok += meta.usage.outputTokens ?? 0;
					hasUsage = true;
				}
				if (meta?.context) context = meta.context;
				for (const p of a.parts) {
					let name: string | null = null;
					if (p.type === "dynamic-tool") name = p.toolName;
					else if (isToolUIPart(p)) name = getToolName(p);
					if (name && !tools.includes(name)) tools.push(name);
				}
				i++;
			}
			result.push({
				id: msg.id,
				userMsg: msg,
				assistantMsg: first ? { ...first, parts } : null,
				inputTokens: hasUsage ? inTok : null,
				outputTokens: hasUsage ? outTok : null,
				context,
				tools,
			});
		}
		return result;
	}, [messages]);

	const latestExchangeId = exchanges.at(-1)?.id;

	// Total cost across completed exchanges, for the per-turn panel's "· total".
	const totalCost = useMemo(() => {
		let total = 0;
		let any = false;
		for (const ex of exchanges) {
			const c = costOf(ex.context?.model, ex.inputTokens, ex.outputTokens);
			if (c != null) {
				total += c;
				any = true;
			}
		}
		return any ? total : null;
	}, [exchanges]);

	// The most recent single request's input tokens = current context occupancy
	// (the exchange total double-counts re-sent context across round-trips).
	const lastInputTokens = useMemo(() => {
		let last: number | null = null;
		for (const m of messages) {
			const meta = m.metadata as ExchangeMetadata | undefined;
			if (m.role === "assistant" && meta?.usage?.inputTokens != null)
				last = meta.usage.inputTokens;
		}
		return last;
	}, [messages]);

	// ── Scroll + timing ──────────────────────────────────────────────────────
	const scrollRef = useRef<HTMLDivElement>(null);
	const lastUserMsgRef = useRef<HTMLDivElement>(null);
	const [containerHeight, setContainerHeight] = useState(400);
	const [atBottom, setAtBottom] = useState(true);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [durations, setDurations] = useState<Record<string, number>>({});
	const [ttfts, setTtfts] = useState<Record<string, number>>({});
	const sendStartRef = useRef<number | null>(null);
	const prevStatusRef = useRef(status);
	const prevBusyRef = useRef(busy);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		setContainerHeight(el.clientHeight);
		const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	function handleScroll() {
		const el = scrollRef.current;
		if (!el) return;
		setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
	}
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-check as content streams in
	useEffect(() => {
		handleScroll();
	}, [messages]);

	// On a new send, scroll the latest user message to the top (its exchange has a
	// one-viewport min-height so it can). useLayoutEffect avoids a flash.
	const prevLatestRef = useRef<string | undefined>(undefined);
	useLayoutEffect(() => {
		if (!latestExchangeId || prevLatestRef.current === latestExchangeId) return;
		prevLatestRef.current = latestExchangeId;
		lastUserMsgRef.current?.scrollIntoView({
			block: "start",
			behavior: "instant",
		});
	}, [latestExchangeId]);

	// TTFT on the first streamed token; duration when the whole loop finishes.
	useEffect(() => {
		if (
			prevStatusRef.current === "submitted" &&
			status === "streaming" &&
			sendStartRef.current &&
			latestExchangeId
		) {
			const ttft = Date.now() - sendStartRef.current;
			setTtfts((p) =>
				latestExchangeId in p ? p : { ...p, [latestExchangeId]: ttft },
			);
		}
		if (prevBusyRef.current && !busy) {
			// Turn finished and the chat persisted server-side — refresh the sidebar.
			refreshChatsRef.current();
			if (sendStartRef.current && latestExchangeId) {
				const dur = Date.now() - sendStartRef.current;
				sendStartRef.current = null;
				setDurations((p) => ({ ...p, [latestExchangeId]: dur }));
			}
		}
		prevStatusRef.current = status;
		prevBusyRef.current = busy;
	}, [status, busy, latestExchangeId]);

	function send() {
		const text = input.trim();
		if (!text || busy || !canSend) return;
		sendStartRef.current = Date.now();
		sendMessage({ text });
		setInput("");
	}

	function scrollToBottom() {
		scrollRef.current?.scrollTo({
			top: scrollRef.current.scrollHeight,
			behavior: "smooth",
		});
	}

	// Edit (redo): drop this exchange and everything after, and put the prompt back
	// in the composer to tweak and resend. Latest exchange only.
	function editExchange(ex: Exchange) {
		const idx = messages.findIndex((m) => m.id === ex.userMsg.id);
		if (idx !== -1) setMessages(messages.slice(0, idx));
		setInput(textOf(ex.userMsg));
	}

	// Fork: copy the conversation up to and including this exchange into a new
	// chat, then switch to it. The original is untouched.
	async function forkExchange(ex: Exchange) {
		const exIdx = exchanges.findIndex((e) => e.id === ex.id);
		const next = exchanges[exIdx + 1];
		const cut = next
			? messages.findIndex((m) => m.id === next.userMsg.id)
			: messages.length;
		const newId = crypto.randomUUID();
		await tasksApi.saveChat(activeTaskId ?? "", newId, {
			systemTemplate: template,
			pinnedSources,
			messages: messages.slice(0, cut).map((m) => ({
				id: m.id,
				role: m.role === "assistant" ? "assistant" : "user",
				parts: m.parts as unknown[],
				metadata: m.metadata,
				createdAt: new Date().toISOString(),
			})),
		});
		refreshChats();
		selectChat(newId);
	}

	function togglePanel(id: string) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function panelData(ex: Exchange): ExchangePanelData {
		const model = ex.context?.model ?? modelId;
		return {
			model,
			inputTokens: ex.inputTokens,
			outputTokens: ex.outputTokens,
			costUsd: costOf(model, ex.inputTokens, ex.outputTokens),
			totalConversationCostUsd: totalCost,
			durationMs: durations[ex.id] ?? null,
			ttftMs: ttfts[ex.id] ?? null,
			pinnedSources: ex.context?.pinnedSources ?? [],
			activeDraft: ex.context?.activeDraft ?? null,
			tools: ex.tools,
		};
	}

	const inputPrice = pricingFor(modelId)?.input ?? null;
	const inputCostPerTurn =
		inputPrice != null && lastInputTokens != null
			? (lastInputTokens / 1_000_000) * inputPrice
			: null;

	return (
		<div className="flex h-full flex-col">
			<SystemCard
				taskId={activeTaskId}
				profileId={activeProfileId}
				pinnedSources={pinnedSources}
				activeDraft={activeDraft}
				template={template}
				edited={chatTemplate !== null}
				onChangeTemplate={setChatTemplate}
				onReset={() => setChatTemplate(null)}
				onNewChat={newChat}
				locked={messages.length > 0}
			/>

			<div className="relative min-h-0 flex-1">
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-full overflow-y-auto p-4"
				>
					{exchanges.length === 0 ? (
						<p className="py-12 text-center text-sm text-muted-foreground">
							Ask Patrick to draft or amend the open document.
						</p>
					) : (
						exchanges.map((ex) => {
							const isLatest = ex.id === latestExchangeId;
							return (
								<div
									key={ex.id}
									style={
										isLatest ? { minHeight: containerHeight - 24 } : undefined
									}
								>
									<div
										ref={isLatest ? lastUserMsgRef : null}
										className="flex justify-end pt-2 pb-1"
									>
										<div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-primary/10 px-3 py-2 text-sm">
											{textOf(ex.userMsg)}
										</div>
									</div>

									{ex.assistantMsg && (
										<div className="max-w-none py-1 text-sm leading-relaxed [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5 [&_h3]:text-sm [&_h3]:font-medium [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:text-xs [&_table]:text-xs [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5">
											<AssistantParts
												parts={ex.assistantMsg.parts}
												isStreaming={isStreaming}
												isLatest={isLatest}
												handlers={toolHandlers}
											/>
										</div>
									)}

									{isLatest && pending && <PendingActivity label={pending} />}

									{ex.assistantMsg && !(isLatest && busy) && (
										<ExchangePanel
											data={panelData(ex)}
											isExpanded={expanded.has(ex.id)}
											onToggle={() => togglePanel(ex.id)}
											onCopy={() => {
												const t = textOf(ex.assistantMsg);
												if (t) navigator.clipboard.writeText(t);
											}}
											onEdit={isLatest ? () => editExchange(ex) : undefined}
											onRetry={isLatest ? () => regenerate() : undefined}
											onFork={() => forkExchange(ex)}
										/>
									)}
								</div>
							);
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
						<ChevronDown className="size-4" />
					</button>
				)}
			</div>

			<div className="p-2">
				<div className="relative">
					<Textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								send();
							}
						}}
						placeholder="Ask Patrick ..."
						className="max-h-48 min-h-20 resize-none pr-12"
					/>
					<div className="absolute right-2 bottom-2 flex items-center gap-1.5">
						{modelId && lastInputTokens != null && (
							<ContextRing
								used={lastInputTokens}
								window={contextWindowFor(modelId)}
								inputCostPerTurn={inputCostPerTurn}
							/>
						)}
						{busy ? (
							<Button
								size="icon"
								variant="secondary"
								onClick={stop}
								className="size-8"
								title="Stop"
							>
								<Square />
							</Button>
						) : (
							<Button
								size="icon"
								onClick={send}
								disabled={!input.trim() || !canSend}
								className="size-8"
								title="Send"
							>
								<SendHorizontal />
							</Button>
						)}
					</div>
				</div>
				<span className="text-[10px] text-muted-foreground/50 flex items-center justify-center">
					AI makes mistakes. Always check.
				</span>
			</div>
		</div>
	);
}

// The live "what's happening" line, shown only while busy. Returns null when the
// trail (running reasoning/tool) or the streaming answer already conveys the
// state — so this fills only the genuine gaps: before the first token, and the
// beats between steps (incl. the gap between a tool result and the next request).
function activityLabel(
	status: string,
	last: UIMessage | undefined,
): string | null {
	if (status === "submitted") return "Thinking…";
	if (last?.role !== "assistant") return "Thinking…";
	const lp = last.parts.at(-1);
	if (!lp) return "Thinking…";
	if (lp.type === "text") return null; // the answer is streaming / visible
	if (lp.type === "reasoning") return null; // the trail shows "Thinking"
	const isTool = lp.type === "dynamic-tool" || lp.type.startsWith("tool-");
	if (isTool && "state" in lp) {
		const running =
			lp.state === "input-streaming" || lp.state === "input-available";
		if (running) return null; // the trail shows the running tool
	}
	return "Working…";
}

function PendingActivity({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground/60">
			<span className="size-1.5 animate-pulse rounded-full bg-current" />
			{label}
		</div>
	);
}
