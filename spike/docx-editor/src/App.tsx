import { DocxEditor, type DocxEditorRef } from "@eigenpal/docx-editor-react"
import "@eigenpal/docx-editor-react/styles.css"
import { useDocxAgentTools } from "@eigenpal/docx-editor-agents/react"
import { useChat } from "@ai-sdk/react"
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai"
import { type FormEvent, useEffect, useRef, useState } from "react"

// Stage 2 of the throwaway spike: the MODEL drives the editor.
// AI SDK v6 (via Vercel AI Gateway) streams tool calls; getAiSdkTools() ships
// them with no `execute`, so each call lands in onToolCall here and we run it
// against the live editor with useDocxAgentTools().executeToolCall — producing
// native Word tracked changes the attorney accepts/rejects. Same HITL/client-
// tool pattern our real app already uses.

// biome-ignore lint/suspicious/noExplicitAny: spike — loose part typing
type AnyPart = any

export function App() {
	const editorRef = useRef<DocxEditorRef | null>(null)
	const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
	const [input, setInput] = useState("Amend claim 1 to add that the frame includes a latch.")

	const { executeToolCall, getContext } = useDocxAgentTools({
		editorRef,
		author: "AgentPat",
	})

	const { messages, sendMessage, addToolResult, status, error } = useChat({
		transport: new DefaultChatTransport({ api: "/api/chat" }),
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		async onToolCall({ toolCall }) {
			const result = executeToolCall(
				toolCall.toolName,
				toolCall.input as Record<string, unknown>,
			)
			addToolResult({
				tool: toolCall.toolName,
				toolCallId: toolCall.toolCallId,
				output: result,
			})
		},
	})

	useEffect(() => {
		fetch("/claims.docx")
			.then((r) => r.arrayBuffer())
			.then(setBuffer)
			.catch((e) => console.error("load error", e))
	}, [])

	function onSubmit(e: FormEvent) {
		e.preventDefault()
		if (!input.trim()) return
		sendMessage({ text: input })
		setInput("")
	}

	return (
		<div style={{ display: "flex", height: "100vh", fontFamily: "system-ui" }}>
			<div style={{ flex: 1, overflow: "auto", borderRight: "1px solid #ddd" }}>
				{buffer ? (
					<DocxEditor ref={editorRef} documentBuffer={buffer} author="Attorney" />
				) : (
					<p style={{ padding: 16 }}>Loading claims.docx…</p>
				)}
			</div>

			<div
				style={{
					width: 460,
					padding: 16,
					overflow: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 12,
					background: "#fafafa",
				}}
			>
				<h3 style={{ margin: 0 }}>AgentPat (model in the loop)</h3>
				<p style={{ fontSize: 12, color: "#666", margin: 0 }}>
					The model locates (read_document / find_text) then mutates
					(suggest_change). Tool calls run against the live editor — watch
					redlines appear, then accept/reject in the editor's UI.
				</p>

				<form onSubmit={onSubmit} style={{ display: "flex", gap: 6 }}>
					<input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Ask AgentPat to amend a claim…"
						style={{ flex: 1, padding: 6 }}
					/>
					<button type="submit" disabled={status === "streaming" || status === "submitted"}>
						{status === "streaming" || status === "submitted" ? "…" : "Send"}
					</button>
				</form>

				{error && (
					<div style={{ color: "#b00", fontSize: 12 }}>error: {String(error)}</div>
				)}

				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{messages.map((m) => (
						<div
							key={m.id}
							style={{
								fontSize: 13,
								padding: 8,
								borderRadius: 6,
								background: m.role === "user" ? "#e8f0fe" : "#fff",
								border: "1px solid #eee",
							}}
						>
							<b style={{ fontSize: 11, color: "#888" }}>{m.role}</b>
							{(m.parts as AnyPart[]).map((p, i) => {
								if (p.type === "text")
									return (
										<div key={`${m.id}-${i}`} style={{ whiteSpace: "pre-wrap" }}>
											{p.text}
										</div>
									)
								if (p.type === "dynamic-tool" || String(p.type).startsWith("tool-")) {
									const name = p.toolName ?? String(p.type).replace(/^tool-/, "")
									return (
										<div
											key={`${m.id}-${i}`}
											style={{
												fontSize: 11,
												fontFamily: "monospace",
												color: "#555",
												background: "#f3f3f3",
												padding: 4,
												marginTop: 4,
												borderRadius: 4,
											}}
										>
											🔧 {name} {p.state ? `(${p.state})` : ""}
											{p.input ? (
												<div>in: {JSON.stringify(p.input)}</div>
											) : null}
											{p.output ? (
												<div>out: {JSON.stringify(p.output).slice(0, 200)}</div>
											) : null}
										</div>
									)
								}
								return null
							})}
						</div>
					))}
				</div>

				<details>
					<summary style={{ fontSize: 12, color: "#666", cursor: "pointer" }}>
						manual tool panel (direct executeToolCall)
					</summary>
					<button
						type="button"
						style={{ marginTop: 8 }}
						onClick={() => console.log("getContext", getContext())}
					>
						log getContext()
					</button>
				</details>
			</div>
		</div>
	)
}
