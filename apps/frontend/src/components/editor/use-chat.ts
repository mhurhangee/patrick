"use client"

import { type UseChatHelpers, useChat as useBaseChat } from "@ai-sdk/react"
import {
	AIChatPlugin,
	aiCommentToRange,
} from "@platejs/ai/react"
import { getCommentKey, getTransientCommentKey } from "@platejs/comment"
import { deserializeMd } from "@platejs/markdown"
import { BlockSelectionPlugin } from "@platejs/selection/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { KEYS, NodeApi, nanoid, TextApi, type TNode } from "platejs"
import { useEditorRef, usePluginOption } from "platejs/react"
import * as React from "react"
import { createSlateEditor } from "platejs"
import { aiChatPlugin } from "@/components/editor/plugins/ai-kit"
import { BaseEditorKit } from "@/components/editor/editor-base-kit"
import {
	getChooseToolPrompt,
	getCommentPrompt,
	getEditPrompt,
	getGeneratePrompt,
} from "@/lib/ai-prompts"
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

function createChatTransport({ api }: { api: string }) {
	return new DefaultChatTransport({
		api,
		fetch: (async (input, init) => {
			try {
				const initBody = JSON.parse(init?.body as string)
				const { messages, ctx } = initBody
				const { children, selection, toolName: toolNameParam } = ctx ?? {}

				// Create a temporary ephemeral editor for prompt computation
				// Mutations (addSelection) are safe on this editor — it's never rendered
				const tempEditor = createSlateEditor({
					plugins: BaseEditorKit,
					selection,
					value: children ?? [{ type: "p", children: [{ text: "" }] }],
				})

				const isSelecting = tempEditor.api.isExpanded()

				// Compute all prompts client-side
				const choosePrompt = getChooseToolPrompt({ isSelecting, messages })
				const generatePrompt = getGeneratePrompt(tempEditor, { isSelecting, messages })
				const commentPrompt = getCommentPrompt(tempEditor, { messages })

				let editPrompt: string | null = null
				let editType: "multi-block" | "selection" | null = null
				if (isSelecting) {
					try {
						const [ep, et] = getEditPrompt(tempEditor, { isSelecting, messages })
						editPrompt = ep
						editType = et
					} catch (e) {
						console.warn("[use-chat] getEditPrompt failed:", e)
					}
				}

				// AI settings from localStorage (BYOK — same keys as copilot-kit)
				const provider = localStorage.getItem("askpat-provider") || "anthropic"
				const model = localStorage.getItem("askpat-quick-model") || ""
				const apiKey = localStorage.getItem(`ai-${provider}-key`) || ""

				const body = {
					toolMode: toolNameParam ?? null,
					isSelecting,
					prompts: {
						choose: choosePrompt,
						generate: generatePrompt,
						edit: editPrompt,
						editType,
						comment: commentPrompt,
					},
					provider,
					apiKey,
					model,
				}

				return fetch(input, { ...init, body: JSON.stringify(body) })
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

	const transport = React.useMemo(
		() => createChatTransport({ api: options.api || "/ai/askpat/command" }),
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

				const discussions =
					editor.getOption(discussionPlugin, "discussions") || []

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

				const updatedDiscussions = [...discussions, newDiscussion]
				editor.setOption(discussionPlugin, "discussions", updatedDiscussions)

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

	React.useEffect(() => {
		editor.setOption(AIChatPlugin, "chat", chat as any)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chat.status, chat.messages, chat.error])

	return chat
}
