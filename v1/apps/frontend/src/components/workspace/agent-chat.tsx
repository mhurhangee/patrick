import { useChat } from "@ai-sdk/react";
import { useDocxAgentTools } from "@eigenpal/docx-editor-agents/react";
import type { DocxEditorRef } from "@eigenpal/docx-editor-react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai";
import { SendHorizontal, Sparkles, Square } from "lucide-react";
import { type RefObject, useMemo, useRef, useState } from "react";
import { BASE_URL } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditorRefFor } from "@/lib/active-editor";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { useWorkspace } from "@/lib/workspace";

export function AgentChat() {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { columnList, focused, getDoc } = useWorkspace();

	// Every open document is context (OPEN = CONTEXT). The server reads each one
	// from disk; we just send the list of what's open.
	const openDocs = useMemo(() => {
		const ids = columnList.flatMap((c) => c.tabs);
		return ids
			.map((id) => {
				const doc = getDoc(id);
				return doc ? { filename: doc.id, kind: doc.kind } : null;
			})
			.filter(
				(d): d is { filename: string; kind: "pdf" | "docx" } => d !== null,
			);
	}, [columnList, getDoc]);

	// AgentPat drives the focused editable .docx. read/write tool calls run
	// against its live editor; the registry resolves whichever is focused.
	const focusedDoc = focused ? getDoc(focused) : undefined;
	const activeEditableId = focusedDoc?.editable ? focusedDoc.id : null;
	const editorRef = useEditorRefFor(activeEditableId);

	const { executeToolCall } = useDocxAgentTools({
		editorRef: editorRef as RefObject<DocxEditorRef | null>,
		author: "AgentPat",
	});

	// Refs so the transport/onToolCall always read the latest without re-creating
	// the chat instance.
	const openDocsRef = useRef(openDocs);
	openDocsRef.current = openDocs;
	const profileIdRef = useRef(activeProfileId);
	profileIdRef.current = activeProfileId;

	const { messages, sendMessage, status, stop, addToolResult } = useChat({
		transport: new DefaultChatTransport({
			api: `${BASE_URL}/tasks/${activeTaskId}/chat`,
			prepareSendMessagesRequest: ({ messages: msgs }) => ({
				body: {
					messages: msgs,
					profileId: profileIdRef.current,
					openDocs: openDocsRef.current,
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
	const isStreaming = status === "streaming" || status === "submitted";
	const canSend = !!activeTaskId && !!activeProfileId;

	function send() {
		const text = input.trim();
		if (!text || isStreaming || !canSend) return;
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
					messages.map((m) => <Message key={m.id} message={m} />)
				)}
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
					{isStreaming ? (
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

// Spine-level rendering: text bubbles + a one-line marker per tool call. The rich
// transparency UI (reasoning trail, tool cards, exchange panel) lands next.
function Message({ message }: { message: UIMessage }) {
	if (message.role === "user") {
		const text = message.parts
			.filter((p) => p.type === "text")
			.map((p) => (p as { text: string }).text)
			.join("\n");
		return (
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
					{text}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-1.5 text-sm leading-relaxed">
			{message.parts.map((part, i) => {
				if (part.type === "text")
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered parts
						<p key={i} className="whitespace-pre-wrap">
							{part.text}
						</p>
					);
				if (part.type === "reasoning" && part.text)
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered parts
						<p key={i} className="text-xs text-muted-foreground/70 italic">
							{part.text}
						</p>
					);
				if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
					const name =
						"toolName" in part
							? (part as { toolName: string }).toolName
							: part.type.replace(/^tool-/, "");
					const state =
						"state" in part ? (part as { state: string }).state : "";
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered parts
							key={i}
							className="rounded-md border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground"
						>
							🔧 {name} {state ? `· ${state}` : ""}
						</div>
					);
				}
				return null;
			})}
		</div>
	);
}
