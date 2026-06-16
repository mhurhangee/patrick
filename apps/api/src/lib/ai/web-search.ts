import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "ai";

// Patrick's web search, by vendor (gateway-routable). Discovery only: the agent
// grounds whatever it surfaces verbatim via ep_law_lookup. No domain restriction
// (Google has none, Anthropic's via gateway is ignored) — we favour official
// sources by prompt and surface every source as-is. Sources stream to the client
// as source-url parts (sendSources) and render as a citations block on the answer.
export function webSearchTool(
	vendor: "anthropic" | "openai" | "google",
): ToolSet {
	if (vendor === "openai") return { web_search: openai.tools.webSearch({}) };
	if (vendor === "google")
		return { google_search: google.tools.googleSearch({}) };
	return { web_search: anthropic.tools.webSearch_20250305({ maxUses: 4 }) };
}
