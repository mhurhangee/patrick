import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { eq, settings } from "@patrickos/db"
import {
	createGateway,
	createUIMessageStream,
	createUIMessageStreamResponse,
	generateText,
	Output,
	streamText,
} from "ai"
import { Hono } from "hono"
import { z } from "zod"
import { db } from "../lib/db"

export const askpatRouter = new Hono()

type ToolMode = "comment" | "edit" | "generate"

const commentItemSchema = z.object({
	blockId: z.string(),
	content: z.string(),
	comments: z.string(),
})

function createModel(provider: string, apiKey: string, modelId: string) {
	const key = apiKey.trim()
	if (provider === "openai") return createOpenAI({ apiKey: key })(modelId)
	if (provider === "gateway") return createGateway({ apiKey: key })(modelId)
	return createAnthropic({ apiKey: key })(modelId)
}

async function loadSystemPrompt() {
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	const parts = [row?.promptAskpat, row?.promptContext].filter(Boolean)
	return parts.length > 0 ? parts.join("\n\n") : undefined
}

askpatRouter.post("/command", async (c) => {
	const body = await c.req.json<{
		toolMode: ToolMode | null
		isSelecting: boolean
		prompts: {
			choose: string
			generate: string
			edit: string | null
			editType: "multi-block" | "selection" | null
			comment: string
		}
		provider: string
		apiKey: string
		model: string
	}>()

	const {
		toolMode: toolModeParam,
		prompts,
		provider,
		apiKey,
		model: modelId,
	} = body
	const model = createModel(provider, apiKey, modelId)
	const systemPrompt = await loadSystemPrompt()

	let toolMode: ToolMode = toolModeParam ?? "generate"

	if (!toolModeParam) {
		try {
			const result = await generateText({
				model,
				system: systemPrompt,
				prompt: prompts.choose,
				output: Output.choice({ options: ["generate", "edit", "comment"] }),
			})
			toolMode = (result.output as ToolMode) ?? "generate"
		} catch {
			toolMode = "generate"
		}
	}

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			writer.write({ type: "data-toolName", data: toolMode })

			if (toolMode === "comment") {
				const result = streamText({
					model,
					system: systemPrompt,
					prompt: prompts.comment,
					output: Output.array({ element: commentItemSchema }),
				})

				for await (const item of result.elementStream) {
					writer.write({
						type: "data-comment",
						data: {
							comment: {
								blockId: item.blockId,
								content: item.content,
								comment: item.comments,
							},
							status: "streaming",
						},
					})
				}

				writer.write({
					type: "data-comment",
					data: { comment: null, status: "finished" },
				})
			} else {
				const prompt =
					toolMode === "edit" && prompts.edit ? prompts.edit : prompts.generate
				const result = streamText({
					model,
					system: systemPrompt,
					prompt,
				})
				writer.merge(result.toUIMessageStream({ sendFinish: false }))
			}
		},
	})

	return createUIMessageStreamResponse({ stream })
})

askpatRouter.post("/copilot", async (c) => {
	const {
		prompt,
		system,
		provider,
		apiKey,
		model: modelId,
	} = await c.req.json<{
		prompt: string
		system?: string
		provider: string
		apiKey: string
		model: string
	}>()

	const model = createModel(provider, apiKey, modelId)

	const result = streamText({
		model,
		system,
		prompt,
		maxOutputTokens: 50,
		temperature: 0.7,
	})

	return result.toTextStreamResponse()
})
