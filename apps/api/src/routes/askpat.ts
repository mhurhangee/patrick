import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { eq, settings } from "@patrickos/db"
import {
	createGateway,
	createUIMessageStream,
	createUIMessageStreamResponse,
	generateText,
	streamText,
} from "ai"
import { Hono } from "hono"
import { db } from "../lib/db"

export const askpatRouter = new Hono()

type ToolName = "edit" | "generate"

function createModel(provider: string, apiKey: string, modelId: string) {
	const key = apiKey.trim()
	if (provider === "openai") return createOpenAI({ apiKey: key })(modelId)
	if (provider === "gateway") return createGateway({ apiKey: key })(modelId)
	return createAnthropic({ apiKey: key })(modelId)
}

const BASE_SYSTEM =
	"You are AskPat, an AI assistant for patent prosecution. You help patent attorneys draft responses to USPTO Office Actions. Write in formal, precise language appropriate for USPTO correspondence. Do not add unsupported factual claims. When editing claims, preserve structure unless explicitly instructed otherwise."

const DOC_TYPE_CONTEXT: Record<string, string> = {
	"claims-draft":
		"The document being edited is a patent claims draft. Focus on precise claim language, proper antecedent basis, claim dependencies, and broadest reasonable interpretation.",
	"patent-spec":
		"The document being edited is a patent specification. Focus on clear technical description, enablement, written description requirements, and consistency with the claims.",
	"office-action":
		"The document being edited is a response to a patent office action. Focus on distinguishing cited prior art, persuasive arguments, and proposed claim amendments.",
	"response-draft":
		"The document being edited is an office action response draft. Maintain a professional, persuasive tone appropriate for USPTO correspondence.",
	"inventor-disclosure":
		"The document being edited is an inventor disclosure. Help capture the invention clearly, identify novel aspects, potential embodiments, and relevant prior art.",
	"prior-art":
		"The document being edited is a prior art analysis. Focus on accurate technical description and objective comparison to the claimed invention.",
}

async function loadSystemPrompt(assetType?: string): Promise<string> {
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	const userPrompts = [row?.promptAskpat, row?.promptContext].filter(Boolean)
	const docContext = assetType ? DOC_TYPE_CONTEXT[assetType] : undefined
	const parts = [BASE_SYSTEM, ...userPrompts, docContext].filter(Boolean)
	return parts.join("\n\n")
}

function buildPrompt(
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
	return `${docContext}Task: ${instruction}. Continue seamlessly from where the document ends. Write in the same formal USPTO correspondence style. One to three sentences unless instructed otherwise.`
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

	const model = createModel(provider, apiKey, modelId)
	const systemPrompt = await loadSystemPrompt(assetType)
	const prompt = buildPrompt(
		toolName,
		instruction,
		selectedMarkdown,
		documentMarkdown,
	)

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			writer.write({ type: "data-toolName", data: toolName })

			const result = streamText({ model, system: systemPrompt, prompt })
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
