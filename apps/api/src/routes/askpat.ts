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

const DOC_TYPE_CONTEXT: Record<string, string> = {
	"claims-draft":
		"The document being edited is a patent claims draft. Focus on precise claim language, proper antecedent basis, claim dependencies, and broadest reasonable interpretation.",
	"patent-spec":
		"The document being edited is a patent specification. Focus on clear technical description, enablement, written description requirements, and consistency with the claims.",
	"office-action":
		"The document being edited is a response to a patent office action. Focus on distinguishing cited prior art, persuasive arguments, and proposed claim amendments.",
	"response-draft":
		"The document being edited is a response draft for patent prosecution. Maintain a professional, persuasive tone appropriate for USPTO correspondence.",
	"inventor-disclosure":
		"The document being edited is an inventor disclosure. Help capture the invention clearly, identify novel aspects, potential embodiments, and relevant prior art.",
	"prior-art":
		"The document being edited is a prior art analysis. Focus on accurate technical description and objective comparison to the claimed invention.",
}

async function loadSystemPrompt(assetType?: string) {
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	const userPrompts = [row?.promptAskpat, row?.promptContext].filter(Boolean)
	const docContext = assetType ? DOC_TYPE_CONTEXT[assetType] : undefined
	const parts = [...userPrompts, docContext].filter(Boolean)
	return parts.length > 0 ? parts.join("\n\n") : undefined
}

askpatRouter.post("/command", async (c) => {
	const body = await c.req.json<{
		toolMode: ToolMode | null
		isSelecting: boolean
		assetType?: string
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
		assetType,
		prompts,
		provider,
		apiKey,
		model: modelId,
	} = body
	const model = createModel(provider, apiKey, modelId)
	const systemPrompt = await loadSystemPrompt(assetType)

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

	// Plate's callCompletionApi expects `res.json()` with a `text` field
	const result = await generateText({
		model,
		system,
		prompt,
		maxOutputTokens: 50,
		temperature: 0.7,
	})

	return c.json({ text: result.text })
})
