import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { eq, settings } from "@patrickos/db"
import { createGateway } from "ai"
import { db } from "./db"

export function createModel(provider: string, apiKey: string, modelId: string) {
	const key = apiKey.trim()
	if (provider === "openai") return createOpenAI({ apiKey: key })(modelId)
	if (provider === "gateway") return createGateway({ apiKey: key })(modelId)
	return createAnthropic({ apiKey: key })(modelId)
}

export const BASE_SYSTEM =
	"You are AskPat, an AI assistant for patent prosecution. You help patent attorneys draft responses to USPTO Office Actions. Write in formal, precise language appropriate for USPTO correspondence. Do not add unsupported factual claims. When editing claims, preserve structure unless explicitly instructed otherwise."

export const DOC_TYPE_CONTEXT: Record<string, string> = {
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

export async function loadSystemPrompt(assetType?: string): Promise<string> {
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	const userPrompts = [row?.promptAskpat, row?.promptContext].filter(Boolean)
	const docContext = assetType ? DOC_TYPE_CONTEXT[assetType] : undefined
	const parts = [BASE_SYSTEM, ...userPrompts, docContext].filter(Boolean)
	return parts.join("\n\n")
}
