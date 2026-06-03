import { readFile } from "node:fs/promises"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import {
	type AiEffort,
	type AnalysisSummary,
	ASSET_CONFIGS,
	type Settings,
	TASK_CONFIGS,
	type TaskType,
} from "@patrickos/shared"
import { createGateway } from "ai"

// PDF binary parts — injected as message content via prepareCall, not system prompt
type FilePart = {
	type: "file"
	data: Uint8Array
	mediaType: "application/pdf"
}

export type AgentPatContext = {
	settings: Settings
	taskPath: string
	openFilePaths: string[]
	taskType?: TaskType
	analysedSources?: AnalysisSummary[]
	excludedFiles?: string[]
}

// ─── Private utilities ────────────────────────────────────────────────────────

function assemble(parts: (string | null | undefined)[]): string {
	return parts.filter(Boolean).join("\n\n")
}

// ─── Parts ────────────────────────────────────────────────────────────────────

function identityAgentPat() {
	return "# Identity\nYou are AgentPat, an expert AI patent attorney assistant. You help patent attorneys with patent prosecution, drafting, and analysis. Write in formal, precise language appropriate for patent practice."
}

function identityAskPat() {
	return "# Identity\nYou are AskPat, an AI writing assistant embedded in a patent document editor. Help edit and generate precise, formal patent text. Do not add unsupported factual claims. When editing claims, preserve structure unless explicitly instructed otherwise."
}

function identityExtractPat() {
	return "# Identity\nYou are an expert patent document analyst. Extract structured data accurately and only from what is explicitly stated in the document. Do not infer or add information not present in the text."
}

function locationInstruction() {
	return `# Field Locations
Every field in the schema is an object { content, locations }. Populate:
- content: the extracted value (string, date, or array as required)
- locations: an array of { page, zone } indicating where in the document the value was found
  - page: 1-based page number
  - zone: "top" | "upper-centre" | "centre" | "lower-centre" | "bottom"
  - Return multiple entries if the content spans non-adjacent locations
  - Return an empty array if no content was found`
}

function userContext(s: Settings) {
	const { name, firm, role, jurisdiction } = s.profile
	if (!name && !firm) return null
	const rolePart = role ? ` (${role})` : ""
	const firmPart = firm ? ` at ${firm}` : ""
	const jurisdictionPart = jurisdiction
		? `, practising before ${jurisdiction}`
		: ""
	return `# Attorney\nYou are assisting ${name}${rolePart}${firmPart}${jurisdictionPart}.`
}

function agentPatInstructions(s: Settings) {
	return s.prompts.agentpat ? `# Instructions\n${s.prompts.agentpat}` : null
}

function askPatInstructions(s: Settings) {
	return s.prompts.askpat ? `# Instructions\n${s.prompts.askpat}` : null
}

function extractPatInstructions(s: Settings) {
	return s.prompts.extractpat ? `# Instructions\n${s.prompts.extractpat}` : null
}

function sharedContext(s: Settings) {
	return s.prompts.context
		? `# Practice Preferences\n${s.prompts.context}`
		: null
}

function taskContext(taskPath: string, taskType?: TaskType) {
	const folderName = taskPath.split("/").at(-1) ?? taskPath
	const config = taskType
		? TASK_CONFIGS.find((p) => p.id === taskType)
		: undefined
	const typeLines = config
		? `\nTask type: ${config.label}\n${config.aiContext}`
		: ""
	return `# Task\nTask folder: ${folderName}\nPath: ${taskPath}${typeLines}`
}

function openFilesContext(openFilePaths: string[]) {
	if (!openFilePaths.length) return null
	const list = openFilePaths
		.map((p) => `- ${p.split("/").at(-1) ?? p}`)
		.join("\n")
	return `# Open Documents\n\nThe following files are currently in context:\n${list}`
}

function analysisContext(analysed: AnalysisSummary[] | undefined) {
	if (!analysed?.length) return null
	const list = analysed
		.map(
			(a) => `- ${a.filename} (${a.assetType}) → analysis/${a.filename}.json`,
		)
		.join("\n")
	return `# Existing Analysis\nThese sources have already been analysed by ExtractPat. The structured result is saved as JSON — read it with the readFile tool (it is far cheaper than re-reading the PDF). Do NOT propose analyseSource for a source listed here; only offer it for sources that are NOT yet analysed.\n${list}`
}

function excludedContext(excluded: string[] | undefined) {
	if (!excluded?.length) return null
	const list = excluded.map((f) => `- ${f}`).join("\n")
	return `# Excluded Documents\nThe attorney has marked these documents as do-not-read. Do NOT read them (readFile is blocked), do NOT propose analysing them, and do NOT rely on them in your response:\n${list}`
}

async function buildFileParts(openFilePaths: string[]): Promise<FilePart[]> {
	const parts: FilePart[] = []
	for (const filePath of openFilePaths) {
		if (!filePath.toLowerCase().endsWith(".pdf")) continue
		try {
			const data = await readFile(filePath)
			parts.push({
				type: "file",
				data: new Uint8Array(data),
				mediaType: "application/pdf",
			})
		} catch {
			// File not readable — skip
		}
	}
	return parts
}

// ─── Feature builders ─────────────────────────────────────────────────────────

export async function buildAgentPatPrompt(
	ctx: AgentPatContext,
): Promise<{ system: string; fileParts: FilePart[] }> {
	const {
		settings,
		taskPath,
		openFilePaths,
		taskType,
		analysedSources,
		excludedFiles,
	} = ctx

	const system = assemble([
		identityAgentPat(),
		userContext(settings),
		agentPatInstructions(settings),
		sharedContext(settings),
		taskContext(taskPath, taskType),
		openFilesContext(openFilePaths),
		analysisContext(analysedSources),
		excludedContext(excludedFiles),
	])

	const fileParts = await buildFileParts(openFilePaths)
	return { system, fileParts }
}

export async function buildAskPatPrompt(ctx: {
	settings: Settings
	assetType?: string
}): Promise<string> {
	const { settings, assetType } = ctx
	const docTypeCtx = assetType
		? ASSET_CONFIGS.find((c) => c.id === assetType)?.aiContext
		: undefined

	return assemble([
		identityAskPat(),
		userContext(settings),
		askPatInstructions(settings),
		sharedContext(settings),
		docTypeCtx ? `# Document\n${docTypeCtx}` : null,
	])
}

export async function buildExtractPatPrompt(
	settings: Settings,
): Promise<string> {
	return assemble([
		identityExtractPat(),
		locationInstruction(),
		extractPatInstructions(settings),
		sharedContext(settings),
	])
}

// ─── Model factory ────────────────────────────────────────────────────────────

// Curated model IDs carry a `vendor/` prefix (the gateway routing form).
// Direct provider SDKs want the bare model name; the gateway wants the prefix.
function stripVendor(modelId: string) {
	const slash = modelId.indexOf("/")
	return slash === -1 ? modelId : modelId.slice(slash + 1)
}

// The vendor behind a model — `provider` for direct, parsed from the ID for gateway.
// Used to namespace providerOptions, which the gateway forwards by vendor key.
function vendorOf(
	provider: string,
	modelId: string,
): "anthropic" | "openai" | "google" {
	const v = provider === "gateway" ? modelId.split("/")[0] : provider
	return v === "openai" || v === "google" ? v : "anthropic"
}

export function createModel(provider: string, apiKey: string, modelId: string) {
	const key = apiKey.trim()
	if (provider === "gateway") return createGateway({ apiKey: key })(modelId)
	const bare = stripVendor(modelId)
	if (provider === "openai") return createOpenAI({ apiKey: key })(bare)
	if (provider === "google")
		return createGoogleGenerativeAI({ apiKey: key })(bare)
	return createAnthropic({ apiKey: key })(bare)
}

// Structural JSON type — matches the AI SDK's ProviderOptions value shape without
// importing it (the type lives in a pnpm-hoisted transitive package).
type Json = string | number | boolean | null | Json[] | { [k: string]: Json }
export type ReasoningProviderOptions = Record<string, Record<string, Json>>

// Map a unified effort + thinking toggle onto each provider's reasoning options,
// to spread into streamText/generateText/ToolLoopAgent.
// `effort: "off"` minimises reasoning for latency-sensitive tasks (ExtractPat):
// OpenAI → minimal, Google → thinking disabled, Anthropic → low (its floor).
export function reasoningOptions(
	provider: string,
	modelId: string,
	effort: AiEffort | "off",
	showThinking: boolean,
): { providerOptions: ReasoningProviderOptions } {
	const vendor = vendorOf(provider, modelId)
	const reason = showThinking && effort !== "off"

	if (vendor === "openai") {
		// "none" disables reasoning (the fast-model path); "minimal" is rejected.
		const openai: Record<string, Json> = {
			reasoningEffort: effort === "off" ? "none" : effort,
		}
		if (reason) openai.reasoningSummary = "auto"
		return { providerOptions: { openai } }
	}

	if (vendor === "google") {
		const thinkingConfig: Record<string, Json> =
			effort === "off"
				? { thinkingBudget: 0 }
				: { thinkingLevel: effort, includeThoughts: showThinking }
		return { providerOptions: { google: { thinkingConfig } } }
	}

	// anthropic: `effort` (output_config.effort) is a frontier-model knob — the
	// fast model (Haiku) rejects it ("Extra inputs are not permitted"). So "off"
	// sends nothing (reasoning disabled). Otherwise send effort + adaptive thinking
	// together (Opus 4.7+ require this pairing; the legacy budgetTokens form is
	// rejected). `display` controls visibility, not whether it thinks.
	const anthropic: Record<string, Json> = {}
	if (effort !== "off") {
		anthropic.effort = effort
		anthropic.thinking = {
			type: "adaptive",
			display: reason ? "summarized" : "omitted",
		}
	}
	return { providerOptions: { anthropic } }
}
