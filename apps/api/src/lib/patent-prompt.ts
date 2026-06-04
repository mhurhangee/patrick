import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { type AiEffort, ASSET_CONFIGS, type Settings } from "@patrickos/shared"
import { createGateway } from "ai"

// NOTE: AgentPat now renders through the template engine (lib/prompt). AskPat
// and ExtractPat below are the last hardcoded builders — ported next.

// ─── Private utilities ────────────────────────────────────────────────────────

function assemble(parts: (string | null | undefined)[]): string {
	return parts.filter(Boolean).join("\n\n")
}

// ─── Parts ────────────────────────────────────────────────────────────────────

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

// ─── Feature builders ─────────────────────────────────────────────────────────

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
