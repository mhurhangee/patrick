"use client"

import { CopilotPlugin } from "@platejs/ai/react"
import { serializeMd, stripMarkdown } from "@platejs/markdown"
import { NodeApi, type TElement } from "platejs"

import { GhostText } from "@/components/ui/ghost-text"
import { BASE_URL } from "@/lib/api"

import { MarkdownKit } from "./markdown-kit"

export const CopilotKit = [
	...MarkdownKit,
	CopilotPlugin.configure(({ api }) => ({
		options: {
			completeOptions: {
				api: `${BASE_URL}/ai/askpat/copilot`,
				body: {
					system: `You are an AI writing assistant for patent attorneys. Continue the text naturally up to the next punctuation mark.

Rules:
- Maintain the formal, precise style of patent documents.
- Do not repeat given text. Continue seamlessly from where it ends.
- CRITICAL: Always end with a punctuation mark.
- CRITICAL: Avoid starting a new block. Do not use block formatting like >, #, 1., 2., -, etc.
- If no context is provided or you can't generate a continuation, return "0" without explanation.`,
				},
				fetch: (async (input, init) => {
					// Inject AI settings (BYOK — keys never stored server-side)
					const initBody = JSON.parse((init?.body as string) ?? "{}")
					const provider = localStorage.getItem("askpat-provider") || "anthropic"
					const apiKey = localStorage.getItem(`ai-${provider}-key`) || ""
					const model = localStorage.getItem("askpat-quick-model") || ""
					return fetch(input, {
						...init,
						body: JSON.stringify({ ...initBody, provider, apiKey, model }),
					})
				}) as typeof fetch,
				onFinish: (_, completion) => {
					if (completion === "0") return

					api.copilot.setBlockSuggestion({
						text: stripMarkdown(completion),
					})
				},
			},
			// Cancel any pending trigger when the user continues typing past a space.
			// Without this, the debounce from a space keypress fires mid-word because
			// autoTriggerQuery only ADDS triggers (when last char is space) but never
			// cancels them when the user keeps typing.
			autoTriggerQuery: ({ editor }) => {
				const _provider = localStorage.getItem("askpat-provider") || "anthropic"
				if (!localStorage.getItem(`ai-${_provider}-key`)) return false
				if (editor.getOptions(CopilotPlugin).suggestionText) return false
				if (editor.api.isEmpty(editor.selection, { block: true })) return false
				const blockAbove = editor.api.block()
				if (!blockAbove) return false
				if (NodeApi.string(blockAbove[0]).at(-1) !== " ") {
					;(api.copilot.triggerSuggestion as any)?.cancel?.()
					return false
				}
				return true
			},
			debounceDelay: 500,
			renderGhostText: GhostText,
			getPrompt: ({ editor }) => {
				const contextEntry = editor.api.block({ highest: true })

				if (!contextEntry) return ""

				const [currentBlock, currentPath] = contextEntry
				const currentIndex = currentPath[0] as number

				// Include up to 4 preceding blocks so the model has cross-block context
				const precedingBlocks = (editor.children as TElement[]).slice(
					Math.max(0, currentIndex - 4),
					currentIndex,
				)

				const precedingText =
					precedingBlocks.length > 0
						? serializeMd(editor, { value: precedingBlocks })
						: null

				const currentText = serializeMd(editor, {
					value: [currentBlock as TElement],
				})

				if (precedingText) {
					return `Continue the text up to the next punctuation mark. Use the preceding context to stay on topic.

Preceding context:
"""
${precedingText}
"""

Continue this:
"""
${currentText}
"""`
				}

				return `Continue the text up to the next punctuation mark:
"""
${currentText}
"""`
			},
		},
		shortcuts: {
			accept: {
				keys: "tab",
			},
			acceptNextWord: {
				keys: "mod+right",
			},
			reject: {
				keys: "escape",
			},
			triggerSuggestion: {
				keys: "ctrl+space",
			},
		},
	})),
]
