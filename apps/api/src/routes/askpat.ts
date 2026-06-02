import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	generateText,
	streamText,
} from "ai"
import { Hono } from "hono"
import { readSettings } from "../lib/fs"
import {
	buildAskPatPrompt,
	createModel,
	reasoningOptions,
} from "../lib/patent-prompt"

export const askpatRouter = new Hono()

type ToolName = "edit" | "generate"

function buildUserPrompt(
	toolName: ToolName,
	instruction: string,
	selectedMarkdown: string | null,
	documentMarkdown: string | null,
): string {
	if (toolName === "edit") {
		const content = selectedMarkdown ?? documentMarkdown ?? ""
		return `${instruction}:\n\n${content}\n\nReturn only the replacement text. No explanation, no preamble.`
	}

	// generate — insert at cursor
	const docContext = documentMarkdown?.trim()
		? `Current document:\n\n${documentMarkdown}\n\n`
		: ""
	return `${docContext}Task: ${instruction}. Continue seamlessly from where the document ends. Write in the same formal patent correspondence style. One to three sentences unless instructed otherwise.`
}

askpatRouter.post("/command", async (c) => {
	const body = await c.req.json<{
		toolName: "edit" | "generate" | null
		instruction: string
		isSelecting: boolean
		selectedMarkdown: string | null
		documentMarkdown: string | null
		assetType?: string
		provider: string
		apiKey: string
		model: string
	}>()

	const {
		toolName: toolNameParam,
		instruction,
		isSelecting,
		selectedMarkdown,
		documentMarkdown,
		assetType,
		provider,
		apiKey,
		model: modelId,
	} = body

	// Default: edit when selecting, generate otherwise
	const toolName: ToolName =
		toolNameParam === "edit" || (toolNameParam === null && isSelecting)
			? "edit"
			: "generate"

	const settings = await readSettings()
	const system = await buildAskPatPrompt({ settings, assetType })

	const model = createModel(provider, apiKey, modelId)
	const { providerOptions } = reasoningOptions(provider, modelId, "low", false)
	const prompt = buildUserPrompt(
		toolName,
		instruction,
		selectedMarkdown,
		documentMarkdown,
	)

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			writer.write({ type: "data-toolName", data: toolName })

			const result = streamText({ model, system, prompt, providerOptions })
			writer.merge(result.toUIMessageStream({ sendFinish: false }))
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
