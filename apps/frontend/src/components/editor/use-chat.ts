"use client"

import { type UseChatHelpers, useChat as useBaseChat } from "@ai-sdk/react"
import {
	AIChatPlugin,
	aiCommentToRange,
} from "@platejs/ai/react"
import { getCommentKey, getTransientCommentKey } from "@platejs/comment"
import { deserializeMd, serializeMd } from "@platejs/markdown"
import { BlockSelectionPlugin } from "@platejs/selection/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { KEYS, NodeApi, nanoid, TextApi, type TElement, type TNode } from "platejs"
import { useEditorRef, usePluginOption } from "platejs/react"
import { useMemo, useEffect } from "react"
import { createSlateEditor } from "platejs"
import { aiChatPlugin } from "@/components/editor/plugins/ai-kit"
import { BaseEditorKit } from "@/components/editor/editor-base-kit"
import { discussionPlugin } from "./plugins/discussion-kit"

export type ToolName = "comment" | "edit" | "generate"

export type TComment = {
	comment: {
		blockId: string
		comment: string
		content: string
	} | null
	status: "finished" | "streaming"
}

export type MessageDataPart = {
	toolName: ToolName
	comment?: TComment
}

export type Chat = UseChatHelpers<ChatMessage>
export type ChatMessage = UIMessage<{}, MessageDataPart>

function getLastInstruction(messages: ChatMessage[]): string {
	const last = [...messages].reverse().find((m) => m.role === "user")
	if (!last) return ""
	return last.parts
		.filter((p) => p.type === "text")
		// biome-ignore lint/suspicious/noExplicitAny: UIMessage part type is a discriminated union
		.map((p) => (p as any).text as string)
		.join("")
		.trim()
}

function createChatTransport({ api }: { api: string }) {
	return new DefaultChatTransport({
		api,
		fetch: (async (input, init) => {
			try {
				const initBody = JSON.parse(init?.body as string)
				const { messages, ctx } = initBody
				const { children, selection, toolName: toolNameParam } = ctx ?? {}

				// Ephemeral editor for serializing document content — never rendered
				const tempEditor = createSlateEditor({
					plugins: BaseEditorKit,
					selection,
					value: children ?? [{ type: "p", children: [{ text: "" }] }],
				})

				const isSelecting = tempEditor.api.isExpanded()

				// Serialize the highlighted selection (blocks under cursor/selection)
				let selectedMarkdown: string | null = null
				if (isSelecting) {
					const selectedBlocks = tempEditor.api.blocks({ mode: "highest" })
					if (selectedBlocks.length > 0) {
						selectedMarkdown = serializeMd(tempEditor, {
							value: selectedBlocks.map(([node]) => node as TElement),
						})
					}
				}

				// Full document as markdown — gives the API context for generation
				const documentMarkdown = serializeMd(tempEditor, {
					value: tempEditor.children as TElement[],
				})

				const provider = localStorage.getItem("askpat-provider") || "anthropic"
				const model = localStorage.getItem("askpat-quick-model") || ""
				const apiKey = localStorage.getItem(`ai-${provider}-key`) || ""
				const assetType = localStorage.getItem("askpat-asset-type") || undefined
				const sourceName =
					localStorage.getItem("askpat-source-name") || undefined

				return fetch(input, {
					...init,
					body: JSON.stringify({
						toolName: toolNameParam ?? null,
						instruction: getLastInstruction(messages),
						isSelecting,
						selectedMarkdown,
						documentMarkdown,
						assetType,
						sourceName,
						provider,
						apiKey,
						model,
					}),
				})
			} catch (err) {
				console.error("[use-chat] fetch error:", err)
				throw err
			}
		}) as typeof fetch,
	})
}

export const useChat = () => {
	const editor = useEditorRef()
	const options = usePluginOption(aiChatPlugin, "chatOptions")

	const transport = useMemo(
		() => createChatTransport({ api: options.api || "/ai/editor/command" }),
		[options.api],
	)

	const baseChat = useBaseChat<ChatMessage>({
		id: "editor",
		transport,
		onData(data) {
			if (data.type === "data-toolName") {
				editor.setOption(AIChatPlugin, "toolName", data.data as ToolName)
			}

			if (data.type === "data-comment" && data.data) {
				const commentData = data.data as TComment

				if (commentData.status === "finished") {
					editor.getApi(BlockSelectionPlugin).blockSelection.deselect()
					return
				}

				const aiComment = commentData.comment!
				const range = aiCommentToRange(editor, aiComment)

				if (!range) return console.warn("No range found for AI comment")

				const discussions = editor.getOption(discussionPlugin, "discussions") || []
				const discussionId = nanoid()

				const newComment = {
					id: nanoid(),
					contentRich: [{ children: [{ text: aiComment.comment }], type: "p" }],
					createdAt: new Date(),
					discussionId,
					isEdited: false,
					userId: editor.getOption(discussionPlugin, "currentUserId"),
				}

				const newDiscussion = {
					id: discussionId,
					comments: [newComment],
					createdAt: new Date(),
					documentContent: deserializeMd(editor, aiComment.content)
						.map((node: TNode) => NodeApi.string(node))
						.join("\n"),
					isResolved: false,
					userId: editor.getOption(discussionPlugin, "currentUserId"),
				}

				editor.setOption(discussionPlugin, "discussions", [...discussions, newDiscussion])

				editor.tf.withMerging(() => {
					editor.tf.setNodes(
						{
							[getCommentKey(newDiscussion.id)]: true,
							[getTransientCommentKey()]: true,
							[KEYS.comment]: true,
						},
						{
							at: range,
							match: TextApi.isText,
							split: true,
						},
					)
				})
			}
		},

		...options,
	})

	const chat = {
		...baseChat,
		_abortFakeStream: baseChat.stop,
	}

	useEffect(() => {
		editor.setOption(AIChatPlugin, "chat", chat as any)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chat.status, chat.messages, chat.error])

	return chat
}
