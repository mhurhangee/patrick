"use client"

import { CopilotPlugin } from "@platejs/ai/react"
import { serializeMd, stripMarkdown } from "@platejs/markdown"
import type { TElement } from "platejs"

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
			debounceDelay: 500,
			renderGhostText: GhostText,
			getPrompt: ({ editor }) => {
				const contextEntry = editor.api.block({ highest: true })

				if (!contextEntry) return ""

				const prompt = serializeMd(editor, {
					value: [contextEntry[0] as TElement],
				})

				return `Continue the text up to the next punctuation mark:
  """
  ${prompt}
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
