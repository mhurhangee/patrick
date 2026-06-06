import {
	DEFAULT_COPILOT_SYSTEM,
	DEFAULT_TEMPLATE_DRAFTPAT,
	DEFAULT_TEMPLATE_NOTEPAT,
} from "@patrickos/shared"
import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	generateText,
	streamText,
} from "ai"
import { Hono } from "hono"
import { readSettings } from "../lib/fs"
import { createModel, reasoningOptions } from "../lib/patent-prompt"
import { render } from "../lib/prompt"

// The inline editor AI. One route, two prompt surfaces: NotePat (the per-source
// Notes editor) and DraftPat (artifact/document editor), chosen by assetType.
export const editorAiRouter = new Hono()

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

editorAiRouter.post("/command", async (c) => {
	const body = await c.req.json<{
		toolName: "edit" | "generate" | null
		instruction: string
		isSelecting: boolean
		selectedMarkdown: string | null
		documentMarkdown: string | null
		assetType?: string
		sourceName?: string
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
		sourceName,
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
	const surface = assetType === "note" ? "notepat" : "draftpat"
	const template =
		surface === "notepat"
			? settings.prompts.notepat || DEFAULT_TEMPLATE_NOTEPAT
			: settings.prompts.draftpat || DEFAULT_TEMPLATE_DRAFTPAT
	const { system } = await render(
		template,
		{ settings, currentSourceName: sourceName },
		surface,
	)

	const model = createModel(provider, apiKey, modelId)
	// Editor AI runs on the fast model — reasoning off (Haiku rejects effort anyway).
	const { providerOptions } = reasoningOptions(provider, modelId, "off", false)
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

editorAiRouter.post("/copilot", async (c) => {
	const {
		prompt,
		provider,
		apiKey,
		model: modelId,
	} = await c.req.json<{
		prompt: string
		provider: string
		apiKey: string
		model: string
	}>()

	const model = createModel(provider, apiKey, modelId)

	// System lives server-side (no longer hardcoded in the editor plugin).
	const result = await generateText({
		model,
		system: DEFAULT_COPILOT_SYSTEM,
		prompt,
		maxOutputTokens: 50,
		temperature: 0.7,
	})

	return c.json({ text: result.text })
})
