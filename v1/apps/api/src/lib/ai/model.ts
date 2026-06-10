import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { AiEffort, Provider } from "@patrick/shared";
import { createGateway } from "ai";

// Curated model IDs carry a `vendor/` prefix (the gateway routing form). Direct
// provider SDKs want the bare model name; the gateway wants the prefix kept.
function stripVendor(modelId: string): string {
	const slash = modelId.indexOf("/");
	return slash === -1 ? modelId : modelId.slice(slash + 1);
}

// The vendor behind a model — `provider` for direct, parsed from the ID for the
// gateway (which forwards providerOptions by vendor key).
function vendorOf(
	provider: Provider,
	modelId: string,
): "anthropic" | "openai" | "google" {
	const v = provider === "gateway" ? modelId.split("/")[0] : provider;
	return v === "openai" || v === "google" ? v : "anthropic";
}

/** Build an AI SDK model from a BYOK key + curated model id. */
export function createModel(
	provider: Provider,
	apiKey: string,
	modelId: string,
) {
	const key = apiKey.trim();
	if (provider === "gateway") return createGateway({ apiKey: key })(modelId);
	const bare = stripVendor(modelId);
	if (provider === "openai") return createOpenAI({ apiKey: key })(bare);
	if (provider === "google")
		return createGoogleGenerativeAI({ apiKey: key })(bare);
	return createAnthropic({ apiKey: key })(bare);
}

// Structural JSON type — matches the AI SDK's ProviderOptions value shape without
// importing it (the type lives in a pnpm-hoisted transitive package).
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type ProviderOptions = Record<string, Record<string, Json>>;

// Map a unified effort + thinking toggle onto each provider's reasoning options,
// to spread into streamText/generateText. `effort: "off"` minimises reasoning:
// OpenAI → none, Google → thinking disabled, Anthropic → omitted.
export function reasoningOptions(
	provider: Provider,
	modelId: string,
	effort: AiEffort | "off",
	showThinking: boolean,
): { providerOptions: ProviderOptions } {
	const vendor = vendorOf(provider, modelId);
	const reason = showThinking && effort !== "off";

	if (vendor === "openai") {
		const openai: Record<string, Json> = {
			reasoningEffort: effort === "off" ? "none" : effort,
		};
		if (reason) openai.reasoningSummary = "auto";
		return { providerOptions: { openai } };
	}

	if (vendor === "google") {
		const thinkingConfig: Record<string, Json> =
			effort === "off"
				? { thinkingBudget: 0 }
				: { thinkingLevel: effort, includeThoughts: showThinking };
		return { providerOptions: { google: { thinkingConfig } } };
	}

	// anthropic: `effort` is a frontier-model knob (Haiku rejects it), so "off"
	// sends nothing. Otherwise pair effort with adaptive thinking (Opus 4.7+
	// require the pairing); `display` controls visibility, not whether it thinks.
	const anthropic: Record<string, Json> = {};
	if (effort !== "off") {
		anthropic.effort = effort;
		anthropic.thinking = {
			type: "adaptive",
			display: reason ? "summarized" : "omitted",
		};
	}
	return { providerOptions: { anthropic } };
}
