import { useChat } from "@ai-sdk/react";
import { useDocxAgentTools } from "@eigenpal/docx-editor-agents/react";
import type { DocxEditorRef } from "@eigenpal/docx-editor-react";
import {
	type Chat,
	contextWindowFor,
	docKind,
	type ExchangeContext,
	type ExchangeMetadata,
	MODELS_BY_ID,
	type PinnedSource,
	toStoredMessage,
	upsertBlock,
} from "@patrick/shared";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	DefaultChatTransport,
	getToolName,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai";
import { ArrowUp, ChevronDown, Globe, Square } from "lucide-react";
import {
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { BASE_URL } from "@/api/client";
import { tasksApi } from "@/api/tasks";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import { useRefreshChats, useStoredChat } from "@/hooks/use-chats";
import { keyStatusOf, useKeyVerification } from "@/hooks/use-key-verification";
import { useLawProvisions } from "@/hooks/use-law";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
import {
	useCreateDocument,
	useFetchPublication,
	useSaveDocuments,
	useTask,
	useTaskDocuments,
	useUnlockDocument,
	useUpdateTask,
} from "@/hooks/use-tasks";
import { useActiveChat } from "@/lib/active-chat";
import { useEditorReadiness, useEditorRefFor } from "@/lib/active-editor";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { useWorkspace, type WorkspaceDoc } from "@/lib/workspace";
import {
	ChatComposer,
	type ChatComposerHandle,
	type MentionItem,
} from "./chat-composer";
import { ChatEmptyState } from "./chat-empty-state";
import {
	AssistantParts,
	HITL_TOOLS,
	type ToolUiHandlers,
} from "./chat-message-parts";
import { ContextRing } from "./context-ring";
import { ExchangePanel, type ExchangePanelData } from "./exchange-panel";
import { SystemCard } from "./system-card";

// Tools that execute on the server (their results stream back) — the client must
// not route them to the docx editor, which would error "Editor not ready". Like
// HITL tools, they're skipped in onToolCall.
const SERVER_TOOLS = new Set([
	"patrick_help",
	"ep_law_lookup",
	"find_law",
	"web_search",
	"google_search",
]);

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

	// Patrick is always mounted (every surface), but a chat is bound to a task.
	// With no task open, stand by rather than wiring up a dead conversation.
	if (!activeTaskId) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
				<Patrick size={28} />
				<p className="max-w-[14rem] text-sm text-muted-foreground">
					Open a task and Patrick will help you work through it.
				</p>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Patrick variant="scanning" size={24} />
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
	const fetchPub = useFetchPublication(activeTaskId ?? "");
	const { data: task } = useTask(activeTaskId);
	const updateTask = useUpdateTask();
	const updateProfile = useUpdateProfile();
	const docsRef = useRef(docs);
	docsRef.current = docs;
	const taskRef = useRef(task);
	taskRef.current = task;
	const profileRef = useRef(profile);
	profileRef.current = profile;
	const { columnList, focused, getDoc, open } = useWorkspace();
	const navigate = useNavigate();
	// Tailor only the empty-state prompt to the open surface (display, not Patrick).
	const surfacePath = useLocation({ select: (l) => l.pathname });
	const composerRef = useRef<ChatComposerHandle>(null);

	// Patrick can't run without a working key — gate the input and say why.
	const keyVerification = useKeyVerification(
		profile?.ai.provider,
		profile?.ai.apiKey,
		{ enabled: !!profile?.ai.apiKey },
	);
	const keyStatus = keyStatusOf(keyVerification);
	const keyReady = keyStatus === "valid";

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

	// Read-only sources currently open in the viewer — this chat's *candidate*
	// context (OPEN = CONTEXT). They're only committed to the chat when you send a
	// message with them open (see send()), so opening docs to find the right one —
	// and closing the rest — never pins them and never costs tokens.
	const openSources = useMemo<PinnedSource[]>(() => {
		const ids = columnList.flatMap((c) => c.tabs);
		return ids
			.map((id) => getDoc(id))
			.filter((d): d is WorkspaceDoc => d != null && !d.editable)
			.map((d) => ({ filename: d.id, kind: d.kind }));
	}, [columnList, getDoc]);

	// Pinned sources: append-only for the chat's life, seeded from a reopened chat.
	// Grown only at send time (the open sources you sent with) and by the
	// requestOpenFile HITL pin — never just by opening a tab. Reset = new chat.
	const [pinnedSources, setPinnedSources] = useState<PinnedSource[]>(
		initial?.pinnedSources ?? [],
	);

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
	const waitForEditor = useEditorReadiness();

	const { executeToolCall } = useDocxAgentTools({
		editorRef: editorRef as RefObject<DocxEditorRef | null>,
		author: profile?.identity.author?.trim() || "Patrick",
	});

	// Web search: a per-chat toolbar toggle (default on). Patrick can search the
	// web; off removes the tool for the turn (also the escape hatch if a model
	// doesn't support it). Sent with each request.
	const [webSearch, setWebSearch] = useState(true);

	// Refs so the transport/onToolCall always read the latest without re-creating
	// the chat instance.
	const webSearchRef = useRef(webSearch);
	webSearchRef.current = webSearch;
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
		error,
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
					webSearch: webSearchRef.current,
				},
			}),
		}),
		// After a client tool resolves, resubmit so the agent loop continues.
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		async onToolCall({ toolCall }) {
			// HITL tools resolve via their card; server-executed tools resolve on the
			// server. Neither runs in the editor — skip both.
			if (
				HITL_TOOLS.has(toolCall.toolName) ||
				SERVER_TOOLS.has(toolCall.toolName)
			)
				return;
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

	const [composerEmpty, setComposerEmpty] = useState(true);
	const canSend = !!activeTaskId && !!activeProfileId && keyReady;

	// @-mention picker: the task's read-only sources (PDFs + original docx — the
	// things that can be pinned), matched against the typed query. Choosing one
	// opens it (OPEN = CONTEXT — it pins at send like any open source).
	const mentionItems = useCallback((query: string): MentionItem[] => {
		const q = query.toLowerCase();
		return (
			(docsRef.current ?? [])
				// read-only sources only — exclude editable Patrick drafts, using the
				// same predicate as the workspace (docKind, not a literal .docx suffix).
				.filter(
					(d) =>
						!d.excluded &&
						!(docKind(d.filename) === "docx" && d.createdInPatrick),
				)
				.filter((d) =>
					`${d.label ?? ""} ${d.filename}`.toLowerCase().includes(q),
				)
				.slice(0, 8)
				.map((d) => ({
					id: d.filename,
					label: d.filename,
					description: d.label && d.label !== d.filename ? d.label : undefined,
				}))
		);
	}, []);

	// /-mention picker: EPC provisions to tag. Matches every typed word against the
	// citation and name ("article 54", "inventive step", "novelty" all work), and
	// the chip serialises to `[Article 54 EPC]` — a citation the agent must retrieve
	// via ep_law_lookup. No side-effect: unlike a source, the law isn't pinned.
	const { data: lawData } = useLawProvisions();
	const provisionsRef = useRef(lawData?.provisions);
	provisionsRef.current = lawData?.provisions;
	const lawItems = useCallback((query: string): MentionItem[] => {
		const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
		const all = provisionsRef.current ?? [];
		// Fall back to the key if an entry predates the `cite` field (stale cache).
		const cite = (p: { cite?: string; key: string }) => p.cite ?? p.key;
		// Group by body so the picker reads as EPC / Guidelines / PCT / Case Law.
		const GROUP_ORDER = ["EPC", "Guidelines", "PCT Guidelines", "Case Law"];
		// Prefer the precomputed group from provisionList; derive only as a fallback
		// for entries from a stale cache that predate the `group` field.
		const groupOf = (p: {
			group?: string;
			kind: string;
			cite?: string;
			key: string;
		}): string =>
			p.group ??
			(p.kind === "caselaw"
				? "Case Law"
				: p.kind === "guideline"
					? cite(p).startsWith("PCT")
						? "PCT Guidelines"
						: "Guidelines"
					: "EPC");
		const toItem = (p: (typeof all)[number]): MentionItem => ({
			id: p.key,
			label: cite(p),
			description: p.name ?? undefined,
			group: groupOf(p),
		});
		// Empty query: just show the first few (order is arbitrary) — don't clone +
		// sort the whole ~6k-entry index on every open.
		if (tokens.length === 0) return all.slice(0, 12).map(toItem);
		return (
			all
				.filter((p) => {
					const hay = `${cite(p)} ${p.name ?? ""}`.toLowerCase();
					return tokens.every((t) => hay.includes(t));
				})
				// Shorter citations first ("Article 54" before "Article 154"), then alpha.
				.sort(
					(a, b) =>
						cite(a).length - cite(b).length || cite(a).localeCompare(cite(b)),
				)
				// Top-16 by relevance, THEN group — so a broad query (e.g. "examination")
				// can fill all 16 slots with one body (EPC) and starve Guidelines/Case
				// Law that also matched. Accepted: specific queries narrow fine; a
				// per-group quota is a deliberate feel change, not a bug to fix blind.
				.slice(0, 16)
				.map(toItem)
				// Group contiguously (stable sort keeps relevance order within a group).
				.sort(
					(a, b) =>
						GROUP_ORDER.indexOf(a.group ?? "") -
						GROUP_ORDER.indexOf(b.group ?? ""),
				)
		);
	}, []);
	const isStreaming = status === "streaming" || status === "submitted";
	// The agent loop spans multiple requests (one per client tool round-trip).
	// `status` dips to "ready" between them, so the SDK's own auto-continue
	// predicate keeps us "busy" across the gaps (no blank UI mid-loop).
	// An errored turn ends "busy" — otherwise a mid-loop failure (e.g. the provider
	// rejecting the next request) leaves the last assistant message "complete with
	// tool calls" and the UI stuck on "Working…" forever.
	const busy =
		status !== "error" &&
		(isStreaming || lastAssistantMessageIsCompleteWithToolCalls({ messages }));
	const pending = busy ? activityLabel(status, messages.at(-1)) : null;

	// Handlers for HITL tool cards (requestOpenFile): resolve the tool call +
	// pin the accepted source into this chat's context.
	const toolHandlers = useMemo<ToolUiHandlers>(
		() => ({
			addToolResult: (args) =>
				addToolResult(args as Parameters<typeof addToolResult>[0]),
			pinSource: (filename) => {
				const kind = docKind(filename);
				setPinnedSources((prev) =>
					prev.some((p) => p.filename === filename)
						? prev
						: [...prev, { filename, kind }],
				);
				// Show what got added — open it in the viewer too.
				open(filename);
			},
			setLabel: (filename, label, suggestions) => {
				const list = docsRef.current;
				if (!list) return;
				saveDocs.mutate(
					list.map((d) =>
						d.filename === filename
							? { ...d, label, ...(suggestions?.length ? { suggestions } : {}) }
							: d,
					),
				);
			},
			// Return null on failure rather than throwing — the card awaits this and
			// must always resolve the tool call, or the agent loop hangs forever.
			// Wait for the new editor to mount + its agent to be ready before
			// resolving, so the agent's first edit doesn't race an unbound editor.
			createDraft: async (name) => {
				try {
					const res = await createDoc.mutateAsync(name);
					open(res.filename);
					await waitForEditor(res.filename);
					return res.filename;
				} catch {
					return null;
				}
			},
			unlockSource: async (filename) => {
				try {
					const res = await unlockDoc.mutateAsync(filename);
					open(res.filename);
					await waitForEditor(res.filename);
					return res.filename;
				} catch {
					return null;
				}
			},
			fetchPublication: async (number) => {
				try {
					const res = await fetchPub.mutateAsync({
						number,
						profileId: profileIdRef.current ?? "",
					});
					// Retrieving a document is an intent to use it — pin it into context
					// (and show it), rather than leaving it fetched-but-invisible.
					const filename = res.filename;
					setPinnedSources((prev) =>
						prev.some((p) => p.filename === filename)
							? prev
							: [...prev, { filename, kind: docKind(filename) }],
					);
					open(filename);
					return { saved: true, filename, summary: res.summary };
				} catch (e) {
					return {
						saved: false,
						error: e instanceof Error ? e.message : "Publication fetch failed.",
					};
				}
			},
			suggestBrief: (brief, append) => {
				const t = taskRef.current;
				if (!t) return;
				// Append adds the note as a new entry (blank-line separated so its own
				// markdown stays intact); otherwise replace the brief whole.
				const existing = t.brief?.trim();
				const next = append && existing ? `${existing}\n\n${brief}` : brief;
				updateTask.mutate({ ...t, brief: next });
				// Show the result where it lives.
				navigate({ to: "/task" });
			},
			suggestPrompt: (heading, content) => {
				const p = profileRef.current;
				if (!p) return;
				// A heading upserts that one section into the live prompt; no heading
				// replaces the whole thing.
				const agentpat = heading
					? upsertBlock(p.prompts.agentpat, heading, content)
					: content;
				updateProfile.mutate({ ...p, prompts: { agentpat } });
				navigate({ to: "/profile" });
			},
		}),
		[
			addToolResult,
			open,
			navigate,
			saveDocs.mutate,
			createDoc.mutateAsync,
			unlockDoc.mutateAsync,
			fetchPub.mutateAsync,
			updateTask.mutate,
			updateProfile.mutate,
			waitForEditor,
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
		const text = composerRef.current?.getMarkdown() ?? "";
		if (!text || busy || !canSend) return;
		// Freeze the instructions at first send — one system prompt per chat. Until
		// now the template follows the live profile (chatTemplate null); snapshot it
		// so later profile edits don't rewrite this chat's prompt.
		if (chatTemplate === null) setChatTemplate(template);
		// Commit OPEN = CONTEXT: pin whatever read-only sources are open right now
		// (append-only). pinnedRef is updated synchronously so this very request
		// carries them; the follow-up loop requests read the same committed set.
		const seen = new Set(pinnedSources.map((p) => p.filename));
		const next = [
			...pinnedSources,
			...openSources.filter((s) => !seen.has(s.filename)),
		];
		if (next.length !== pinnedSources.length) {
			pinnedRef.current = next;
			setPinnedSources(next);
		}
		sendStartRef.current = Date.now();
		sendMessage({ text });
		composerRef.current?.clear();
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
		composerRef.current?.setMarkdown(textOf(ex.userMsg));
		composerRef.current?.focus();
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
			messages: messages
				.slice(0, cut)
				.map((m) => toStoredMessage({ ...m, parts: m.parts as unknown[] })),
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

	// A locked chat keeps its frozen instructions; if the active profile's prompt
	// has since changed (edited, or a different profile selected), the chat no
	// longer reflects it. Surface that rather than silently re-resolving.
	const locked = messages.length > 0;
	const profileMismatch =
		locked &&
		chatTemplate !== null &&
		!!profile &&
		chatTemplate !== profileTemplate;

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
				locked={locked}
				profileMismatch={profileMismatch}
				profileName={profile?.identity.name}
			/>

			<div className="relative min-h-0 flex-1">
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-full overflow-y-auto p-4"
				>
					{exchanges.length === 0 ? (
						<ChatEmptyState
							surfacePath={surfacePath}
							doc={focused ? getDoc(focused) : undefined}
							onPick={(text) => {
								composerRef.current?.setMarkdown(text);
								composerRef.current?.focus();
							}}
						/>
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
				{error && (
					<div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						<span className="min-w-0 flex-1 break-words">
							{errorText(error)}
						</span>
						<button
							type="button"
							onClick={() => regenerate()}
							className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
						>
							Retry
						</button>
					</div>
				)}
				{!keyReady && (
					<button
						type="button"
						onClick={() => navigate({ to: "/profile", hash: "ai" })}
						className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						{keyStatus === "verifying"
							? "Verifying your API key…"
							: keyStatus === "invalid"
								? "Your API key isn't verified — open your profile."
								: "Add an API key in your profile to chat."}
					</button>
				)}
				<div className="rounded-lg border bg-background focus-within:border-ring">
					<ChatComposer
						ref={composerRef}
						disabled={!keyReady}
						onSubmit={send}
						mentionItems={mentionItems}
						onMention={(id) => open(id)}
						lawItems={lawItems}
						onEmptyChange={setComposerEmpty}
					/>
					{/* Toolbar BELOW the editor — no overlap with the text (was bug #5). */}
					<div className="flex items-center justify-end gap-1.5 px-2 pb-2">
						<Button
							size="icon"
							variant="ghost"
							onClick={() => setWebSearch((v) => !v)}
							aria-pressed={webSearch}
							title={
								webSearch
									? "Web search on — Patrick can search the web"
									: "Web search off"
							}
							className={`mr-auto size-8 ${webSearch ? "text-emerald-600" : "text-muted-foreground/50"}`}
						>
							<Globe />
						</Button>
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
								disabled={composerEmpty || !canSend}
								className="size-8"
								title="Send"
							>
								<ArrowUp />
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
			<Patrick variant="scanning" size={12} />
			{label}
		</div>
	);
}

// A readable line from a failed turn. Provider/gateway errors carry a useful
// message (e.g. "A positive credit balance is required…"); opaque ones fall back
// to something generic rather than "[object Object]".
function errorText(error: Error): string {
	const m = error.message?.trim();
	if (!m || m === "[object Object]") {
		return "Something went wrong with this request. Please try again.";
	}
	return m.length > 300 ? `${m.slice(0, 300)}…` : m;
}
