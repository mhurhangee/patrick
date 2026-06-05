import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { AiEffort } from "@patrickos/shared"
import { createGateway } from "ai"

// System-prompt assembly now lives in the template engine (lib/prompt). What
// remains here is the model factory + reasoning-option mapping.

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
