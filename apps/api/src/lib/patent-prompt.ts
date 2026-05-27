import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { type AssetKind, type AssetType, eq, settings } from "@patrickos/db"
import { createGateway } from "ai"
import { db } from "./db"

// ─── AgentPat system prompt builder ──────────────────────────────────────────

type AssetRow = {
	id: string
	title: string
	type: AssetType
	kind: AssetKind
	date: string
	content: string
	details: string | null
}

type SettingsRow = {
	name: string
	firm: string
	role: string
	jurisdiction: string
	promptAgentpat: string
	promptContext: string
}

type ProjectRow = {
	name: string
	type: string
}

function extractNodeText(node: unknown): string {
	if (typeof node !== "object" || node === null) return ""
	const n = node as Record<string, unknown>
	if (typeof n.text === "string") return n.text
	if (Array.isArray(n.children)) return n.children.map(extractNodeText).join("")
	return ""
}

function plateJsonToText(content: string): string {
	try {
		const nodes = JSON.parse(content) as unknown[]
		return nodes.map(extractNodeText).filter(Boolean).join("\n")
	} catch {
		return content
	}
}

export function buildAgentPatSystemPrompt({
	settingsRow,
	projectRow,
	allAssets,
	openAssetIds,
	pdfAttachedIds,
}: {
	settingsRow: SettingsRow | undefined
	projectRow: ProjectRow | undefined
	allAssets: AssetRow[]
	openAssetIds: string[]
	pdfAttachedIds: string[]
}): string {
	const parts: string[] = []

	parts.push(
		"You are AgentPat, an expert AI patent attorney assistant. You help patent attorneys with patent prosecution, drafting, and analysis. Write in formal, precise language appropriate for patent practice.",
	)

	// User/firm context
	if (settingsRow) {
		const ctx: string[] = []
		if (settingsRow.name) ctx.push(`Attorney: ${settingsRow.name}`)
		if (settingsRow.firm) ctx.push(`Firm: ${settingsRow.firm}`)
		if (settingsRow.role) ctx.push(`Role: ${settingsRow.role}`)
		if (settingsRow.jurisdiction)
			ctx.push(`Jurisdiction: ${settingsRow.jurisdiction}`)
		if (ctx.length > 0) parts.push(ctx.join("\n"))
		if (settingsRow.promptAgentpat) parts.push(settingsRow.promptAgentpat)
		if (settingsRow.promptContext) parts.push(settingsRow.promptContext)
	}

	// Project context
	if (projectRow) {
		parts.push(
			`## Current Project\nName: ${projectRow.name}\nType: ${projectRow.type}`,
		)
	}

	// All assets — table of contents with extracted details inline
	if (allAssets.length > 0) {
		const assetLines = allAssets.map((a) => {
			const detailsSummary = a.details ? `\n  Details: ${a.details}` : ""
			const dateStr = a.date ? ` | Date: ${a.date}` : ""
			return `- [${a.id}] ${a.title} (${a.type}, ${a.kind}${dateStr})${detailsSummary}`
		})
		parts.push(
			`## Project Assets\nAll assets in this project. Extracted summaries/details are included below. You can only read the full content of assets that are currently open in the user's workspace (listed in the sections below). If you need to see a document that is not open, ask the user to open it.\n${assetLines.join("\n")}`,
		)
	}

	// In-context artifacts — include full content directly
	const openArtifacts = allAssets.filter(
		(a) => openAssetIds.includes(a.id) && a.kind === "artifact" && a.content,
	)
	if (openArtifacts.length > 0) {
		const artifactSections = openArtifacts.map(
			(a) => `### ${a.title} (${a.type})\n${plateJsonToText(a.content)}`,
		)
		parts.push(
			`## In-Context Documents (full content)\nThe following documents are currently open in the user's workspace:\n\n${artifactSections.join("\n\n")}`,
		)
	}

	// Sources in context — split by whether the PDF was actually attached
	const openSources = allAssets.filter(
		(a) => openAssetIds.includes(a.id) && a.kind === "source",
	)
	const attachedSources = openSources.filter((a) =>
		pdfAttachedIds.includes(a.id),
	)
	const sourcesWithoutPdf = openSources.filter(
		(a) => !pdfAttachedIds.includes(a.id),
	)

	if (attachedSources.length > 0) {
		const list = attachedSources.map((a) => `- [${a.id}] ${a.title}`).join("\n")
		parts.push(
			`## In-Context Source Documents (attached as files)\nThe following source PDFs have been attached to this conversation — read them directly:\n${list}`,
		)
	}
	if (sourcesWithoutPdf.length > 0) {
		const list = sourcesWithoutPdf
			.map((a) => `- [${a.id}] ${a.title}`)
			.join("\n")
		parts.push(
			`## In-Context Source Documents (no PDF uploaded)\nThe following sources are open but have no PDF file yet. Their extracted details are in the asset list above.\n${list}`,
		)
	}

	return parts.join("\n\n")
}

export function createModel(provider: string, apiKey: string, modelId: string) {
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

export async function loadSystemPrompt(assetType?: string): Promise<string> {
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	const userPrompts = [row?.promptAskpat, row?.promptContext].filter(Boolean)
	const docContext = assetType ? DOC_TYPE_CONTEXT[assetType] : undefined
	const parts = [BASE_SYSTEM, ...userPrompts, docContext].filter(Boolean)
	return parts.join("\n\n")
}
