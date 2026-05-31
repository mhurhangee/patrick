/**
 * Prompt builder for all AI features.
 *
 * Parts are functions — call them with explicit args, get a string back.
 * assemble() joins non-empty parts into a system prompt.
 * Feature builders pick the parts they need.
 *
 * To change how something works: edit the part function — it updates everywhere.
 * To add a new part: write a function in the Parts section.
 * To add a new feature (e.g. ChatPat): write a builder that calls assemble().
 */

import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import {
	ASSET_CONFIGS,
	type AssetKind,
	type AssetType,
	DEFAULT_PROMPT_AGENTPAT,
	DEFAULT_PROMPT_ASKPAT,
	DEFAULT_PROMPT_CONTEXT,
	DEFAULT_PROMPT_EXTRACTPAT,
	eq,
	getFormFields,
	PROJECT_CONFIGS,
	settings,
} from "@patrickos/db"
import { createGateway } from "ai"
import { db } from "./db"

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsRow = Awaited<ReturnType<typeof loadSettings>>

type AssetRow = {
	id: string
	title: string
	type: AssetType
	kind: AssetKind
	date: string
	content: string
	details: string | null
}

type PdfSource = { id: string; title: string; data: unknown }

// PDF binary parts — injected as message content by chats.ts via prepareCall,
// not into the system string (binary data can't go in a system prompt).
type FilePart = {
	type: "file"
	data: Uint8Array
	mediaType: "application/pdf"
}

export type AgentPatContext = {
	project?: {
		name: string
		type: string
		clientName?: string
		clientIndustry?: string
		clientPreferences?: string
	}
	allAssets?: AssetRow[]
	openAssetIds?: string[]
	pdfSources?: PdfSource[]
}

// ─── Private utilities ────────────────────────────────────────────────────────

async function loadSettings() {
	// Upsert ensures a row always exists. Insert with real defaults on first creation
	// so prompts are active immediately without requiring the user to visit settings.
	await db
		.insert(settings)
		.values({
			id: "local",
			promptAgentpat: DEFAULT_PROMPT_AGENTPAT,
			promptAskpat: DEFAULT_PROMPT_ASKPAT,
			promptContext: DEFAULT_PROMPT_CONTEXT,
			promptExtractpat: DEFAULT_PROMPT_EXTRACTPAT,
		})
		.onConflictDoNothing()
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	return row
}

function assemble(parts: (string | null | undefined)[]): string {
	return parts.filter(Boolean).join("\n\n")
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

// Renders extracted details JSON as human-readable "Label: value" lines.
// Uses getFormFields() so labels stay in sync with the form.
function formatDetails(assetType: string, details: string | null): string {
	if (!details) return ""
	try {
		const parsed = JSON.parse(details) as Record<string, unknown>
		return getFormFields(assetType)
			.map((f) => {
				const val = parsed[f.key]
				if (val === undefined || val === null || val === "") return ""
				if (Array.isArray(val)) {
					if (val.length === 0) return ""
					return `${f.label}:\n${val.map((v) => `  - ${v}`).join("\n")}`
				}
				return `${f.label}: ${val}`
			})
			.filter(Boolean)
			.join("\n")
	} catch {
		return ""
	}
}

// ─── Parts ────────────────────────────────────────────────────────────────────

// Hardcoded personas — set the floor for behaviour. User instructions layer
// on top but cannot overwrite these.

function identityAgentPat() {
	return "# Identity\nYou are AgentPat, an expert AI patent attorney assistant. You help patent attorneys with patent prosecution, drafting, and analysis. Write in formal, precise language appropriate for patent practice."
}

function identityAskPat() {
	return "# Identity\nYou are AskPat, an AI writing assistant embedded in a patent document editor. Help edit and generate precise, formal patent text. Do not add unsupported factual claims. When editing claims, preserve structure unless explicitly instructed otherwise."
}

function identityExtractPat() {
	return "# Identity\nYou are an expert patent document analyst. Extract structured data accurately and only from what is explicitly stated in the document. Do not infer or add information not present in the text."
}

// Hardcoded — not user-editable because it's a schema contract, not a style preference.
function locationInstruction() {
	return `# Field Locations
Every field in the schema is an object { content, locations }. Populate:
- content: the extracted value (string, date, or array as required)
- locations: an array of { page, zone } indicating where in the document the value was found
  - page: 1-based page number
  - zone: which vertical zone of that page the content falls in — choose one of:
      "top"           — very top of the page (letterhead, stamps, document header)
      "upper-centre"  — upper portion of the body (e.g. header tables, first paragraphs)
      "centre"        — middle of the page body
      "lower-centre"  — lower portion of the body
      "bottom"        — very bottom (footer, signature block, page number)
  - If the content appears in one place, return one location entry
  - If it spans a page break or appears in multiple non-adjacent places, return multiple entries
  - If no content was found, return an empty locations array`
}

// Attorney/firm info from settings — written as a sentence so it reads naturally
// in context rather than as a data dump.
function userContext(s: SettingsRow) {
	if (!s) return null
	if (!s.name && !s.firm) return null
	const role = s.role ? ` (${s.role})` : ""
	const firm = s.firm ? ` at ${s.firm}` : ""
	const jurisdiction = s.jurisdiction
		? `, practising before ${s.jurisdiction}`
		: ""
	return `# Attorney\nYou are assisting ${s.name}${role}${firm}${jurisdiction}.`
}

// User-editable instructions per feature — wrapped with a section heading.
function agentPatInstructions(s: SettingsRow) {
	const text = s?.promptAgentpat || null
	return text ? `# Instructions\n${text}` : null
}
function askPatInstructions(s: SettingsRow) {
	const text = s?.promptAskpat || null
	return text ? `# Instructions\n${text}` : null
}
function extractPatInstructions(s: SettingsRow) {
	const text = s?.promptExtractpat || null
	return text ? `# Instructions\n${text}` : null
}

// User-editable context shared across all features (style guides, preferences).
function sharedContext(s: SettingsRow) {
	const text = s?.promptContext || null
	return text ? `# Practice Preferences\n${text}` : null
}

// Active project name + procedure context from PROJECT_CONFIGS + client info.
function projectContext(project: AgentPatContext["project"]) {
	if (!project) return null
	const config = PROJECT_CONFIGS.find((c) => c.id === project.type)
	const label = config?.label ?? project.type
	const lines = [`# Project: ${project.name} (${label})`]
	if (config?.aiContext) lines.push(config.aiContext)
	if (
		project.clientName ||
		project.clientIndustry ||
		project.clientPreferences
	) {
		const industry = project.clientIndustry
			? ` (${project.clientIndustry})`
			: ""
		lines.push(
			`\n## Client\n${project.clientName}${industry} — the attorney is acting on behalf of this client.`,
		)
		if (project.clientPreferences)
			lines.push(`\nClient preferences:\n${project.clientPreferences}`)
	}
	return lines.join("\n")
}

// All project assets — type labels, AI context, and extracted details.
// [open] marks assets currently visible in the workspace.
function assetToc(assets: AssetRow[], openIds: string[]) {
	if (!assets.length) return null
	const sections = assets.map((a) => {
		const config = ASSET_CONFIGS.find((c) => c.id === a.type)
		const typeLabel = config?.typeLabel ?? a.type
		const header = `## ${a.title}${openIds.includes(a.id) ? " [open]" : ""}\nType: ${typeLabel}${a.date ? ` | ${a.date}` : ""}`
		const context = config?.aiContext ? `Context: ${config.aiContext}` : ""
		const details = formatDetails(a.type, a.details)
		return [header, context, details].filter(Boolean).join("\n")
	})
	return `# Project Assets\n\n${sections.join("\n\n")}`
}

// Full Plate text of open artifact documents.
function openArtifacts(assets: AssetRow[], openIds: string[]) {
	const artifacts = assets.filter(
		(a) => a.kind === "artifact" && openIds.includes(a.id) && a.content,
	)
	if (!artifacts.length) return null
	const sections = artifacts.map(
		(a) => `## ${a.title}\n${plateJsonToText(a.content)}`,
	)
	return `# Open Documents\n\n${sections.join("\n\n")}`
}

// Text listing which PDFs are attached — always pair with buildFileParts().
function pdfList(pdfSources: PdfSource[], assets: AssetRow[]) {
	if (!pdfSources.length) return null
	const list = pdfSources
		.map((b) => {
			const assetType = assets.find((a) => a.id === b.id)?.type
			const config = assetType
				? ASSET_CONFIGS.find((c) => c.id === assetType)
				: undefined
			return `- ${b.title}${config ? ` (${config.typeLabel})` : ""}`
		})
		.join("\n")
	return `# Source Documents\n\nThe following source documents are attached as files — read them directly:\n${list}`
}

// AskPat: what type of document is being edited.
function docTypeContext(assetType: string | undefined) {
	if (!assetType) return null
	const config = ASSET_CONFIGS.find((c) => c.id === assetType)
	return config?.aiContext ? `# Document\n${config.aiContext}` : null
}

// Load-bearing infrastructure — drives suggestions, chat title, cost panel.
// Hardcoded so user instructions can't accidentally omit it.
function metadataInstruction() {
	return "\n\nAfter providing your complete response, you MUST call generateMetadata exactly once as your final action. Provide exactly 3 short follow-up suggestions (under 8 words each), a concise chat title, and a one-sentence summary of your last response."
}

// Builds the binary file parts array for PDF attachment (not part of system text).
function buildFileParts(pdfSources: PdfSource[]): FilePart[] {
	return pdfSources.map((b) => ({
		type: "file" as const,
		data: b.data as unknown as Uint8Array,
		mediaType: "application/pdf" as const,
	}))
}

// ─── Feature builders ─────────────────────────────────────────────────────────

export async function buildAgentPatPrompt(
	ctx: AgentPatContext,
): Promise<{ system: string; fileParts: FilePart[] }> {
	const s = await loadSettings()
	const allAssets = ctx.allAssets ?? []
	const openIds = ctx.openAssetIds ?? []
	const pdfSources = ctx.pdfSources ?? []

	const system = assemble([
		identityAgentPat(),
		userContext(s),
		agentPatInstructions(s),
		sharedContext(s),
		projectContext(ctx.project),
		assetToc(allAssets, openIds),
		openArtifacts(allAssets, openIds),
		pdfList(pdfSources, allAssets),
		metadataInstruction(),
	])
	console.log(`=====AgentPat====== \n ${system}`)

	return { system, fileParts: buildFileParts(pdfSources) }
}

export async function buildAskPatPrompt(ctx: {
	assetType?: string
}): Promise<string> {
	const s = await loadSettings()
	const system = assemble([
		identityAskPat(),
		userContext(s),
		askPatInstructions(s),
		sharedContext(s),
		docTypeContext(ctx.assetType),
	])

	console.log(`=====AskPat====== \n ${system}`)
	return system
}

export async function buildExtractPatPrompt(): Promise<string> {
	const s = await loadSettings()
	const system = assemble([
		identityExtractPat(),
		locationInstruction(),
		extractPatInstructions(s),
		sharedContext(s),
	])
	console.log(`=====ExtractPat====== \n ${system}`)
	return system
}

// ─── Model factory ────────────────────────────────────────────────────────────

export function createModel(provider: string, apiKey: string, modelId: string) {
	const key = apiKey.trim()
	if (provider === "openai") return createOpenAI({ apiKey: key })(modelId)
	if (provider === "gateway") return createGateway({ apiKey: key })(modelId)
	return createAnthropic({ apiKey: key })(modelId)
}
