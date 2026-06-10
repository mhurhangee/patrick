import { useChat } from "@ai-sdk/react";
import { useDocxAgentTools } from "@eigenpal/docx-editor-agents/react";
import type { DocxEditorRef } from "@eigenpal/docx-editor-react";
import type { PinnedSource } from "@patrick/shared";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai";
import { SendHorizontal, Sparkles, Square } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { BASE_URL } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditorRefFor } from "@/lib/active-editor";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { useWorkspace, type WorkspaceDoc } from "@/lib/workspace";
import { AssistantParts } from "./chat-message-parts";

export function AgentChat() {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { columnList, focused, getDoc } = useWorkspace();

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
	const [pinnedSources, setPinnedSources] = useState<PinnedSource[]>([]);
	useEffect(() => {
		setPinnedSources((prev) => {
			const seen = new Set(prev.map((p) => p.filename));
			const additions = openSources.filter((s) => !seen.has(s.filename));
			return additions.length ? [...prev, ...additions] : prev;
		});
	}, [openSources]);

	// AgentPat edits the focused editable .docx (the live workspace). It's not in
	// the static context — the agent reads it live via the editor tools.
	const focusedDoc = focused ? getDoc(focused) : undefined;
	const activeDraft = focusedDoc?.editable ? focusedDoc.id : null;
	const editorRef = useEditorRefFor(activeDraft);

	const { executeToolCall } = useDocxAgentTools({
		editorRef: editorRef as RefObject<DocxEditorRef | null>,
		author: "AgentPat",
	});

	// Refs so the transport/onToolCall always read the latest without re-creating
	// the chat instance.
	const pinnedRef = useRef(pinnedSources);
	pinnedRef.current = pinnedSources;
	const activeDraftRef = useRef(activeDraft);
	activeDraftRef.current = activeDraft;
	const profileIdRef = useRef(activeProfileId);
	profileIdRef.current = activeProfileId;

	const { messages, sendMessage, status, stop, addToolResult } = useChat({
		transport: new DefaultChatTransport({
			api: `${BASE_URL}/tasks/${activeTaskId}/chat`,
			prepareSendMessagesRequest: ({ messages: msgs }) => ({
				body: {
					messages: msgs,
					profileId: profileIdRef.current,
					pinnedSources: pinnedRef.current,
					activeDraft: activeDraftRef.current,
				},
			}),
		}),
		// After a client tool resolves, resubmit so the agent loop continues.
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		async onToolCall({ toolCall }) {
			// Runs against the focused editor. If none is focused (or the call
			// fails), report an error result so the agent can recover rather than
			// the whole turn throwing.
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
	// Real streaming status — drives the streaming answer + the trail's running
	// step indicators.
	const isStreaming = status === "streaming" || status === "submitted";
	// The agent loop spans multiple requests (one per client tool round-trip).
	// `status` dips to "ready" between them, so rely on the SDK's own
	// auto-continue predicate to stay "busy" across the gaps — otherwise the UI
	// blanks out mid-loop (the v0 "nothing after a tool call" bug).
	const busy =
		isStreaming || lastAssistantMessageIsCompleteWithToolCalls({ messages });
	// The trail shows running reasoning/tools inline; this line fills the gaps it
	// can't — waiting for the first token, and the beats between steps.
	const pending = busy ? activityLabel(status, messages.at(-1)) : null;

	function send() {
		const text = input.trim();
		if (!text || busy || !canSend) return;
		sendMessage({ text });
		setInput("");
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-b px-4 py-2.5">
				<Sparkles className="size-4 text-primary" />
				<span className="text-sm font-medium">AgentPat</span>
			</div>

			<div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
				{messages.length === 0 ? (
					<p className="py-12 text-center text-sm text-muted-foreground">
						Ask AgentPat to draft or amend the open document.
					</p>
				) : (
					messages.map((m, i) => (
						<Message
							key={m.id}
							message={m}
							isStreaming={isStreaming}
							isLatest={i === messages.length - 1}
						/>
					))
				)}
				{pending && <PendingActivity label={pending} />}
			</div>

			<div className="border-t p-3">
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
						placeholder="Ask AgentPat to draft or amend…"
						className="max-h-48 min-h-20 resize-none pr-12"
					/>
					{busy ? (
						<Button
							size="icon"
							variant="secondary"
							onClick={stop}
							className="absolute right-2 bottom-2 size-8"
							title="Stop"
						>
							<Square />
						</Button>
					) : (
						<Button
							size="icon"
							onClick={send}
							disabled={!input.trim() || !canSend}
							className="absolute right-2 bottom-2 size-8"
							title="Send"
						>
							<SendHorizontal />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

function Message({
	message,
	isStreaming,
	isLatest,
}: {
	message: UIMessage;
	isStreaming: boolean;
	isLatest: boolean;
}) {
	if (message.role === "user") {
		const text = message.parts
			.filter((p) => p.type === "text")
			.map((p) => (p as { text: string }).text)
			.join("\n");
		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-primary/10 px-3 py-2 text-sm">
					{text}
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-none text-sm leading-relaxed [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5 [&_h3]:text-sm [&_h3]:font-medium [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:text-xs [&_table]:text-xs [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5">
			<AssistantParts
				parts={message.parts}
				isStreaming={isStreaming}
				isLatest={isLatest}
			/>
		</div>
	);
}

// The live "what's happening" line, shown only while the loop is busy. Returns
// null when the trail (running reasoning/tool) or the streaming answer already
// conveys the state — so this only fills the genuine gaps: the wait before the
// first token, and the beats between steps (incl. the gap between a tool result
// and the auto-resubmitted next request).
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
		<div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground/60">
			<span className="size-1.5 animate-pulse rounded-full bg-current" />
			{label}
		</div>
	);
}
