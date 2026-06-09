import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { Provider } from "@patrick/shared";
import { createGateway } from "ai";

// Curated model IDs carry a `vendor/` prefix (the gateway routing form). Direct
// provider SDKs want the bare model name; the gateway wants the prefix kept.
function stripVendor(modelId: string): string {
	const slash = modelId.indexOf("/");
	return slash === -1 ? modelId : modelId.slice(slash + 1);
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
