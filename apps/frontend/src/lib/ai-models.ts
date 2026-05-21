export type Provider = "gateway" | "anthropic" | "openai"

export type GatewayModel = {
	id: string
	name: string
	description?: string | null
	pricing?: { input: string; output: string } | null
	specification: { provider: string; modelId: string }
}

export type CuratedModel = {
	id: string
	name: string
	pricingPerM?: { input: number; output: number }
}

export const CURATED_MODELS: Record<"anthropic" | "openai", CuratedModel[]> = {
	anthropic: [
		{
			id: "claude-haiku-4-5",
			name: "Claude Haiku 4.5",
			pricingPerM: { input: 0.8, output: 4.0 },
		},
		{
			id: "claude-sonnet-4-6",
			name: "Claude Sonnet 4.6",
			pricingPerM: { input: 3.0, output: 15.0 },
		},
		{
			id: "claude-opus-4-7",
			name: "Claude Opus 4.7",
			pricingPerM: { input: 15.0, output: 75.0 },
		},
	],
	openai: [
		{
			id: "gpt-4o-mini",
			name: "GPT-4o Mini",
			pricingPerM: { input: 0.15, output: 0.6 },
		},
		{
			id: "gpt-4o",
			name: "GPT-4o",
			pricingPerM: { input: 2.5, output: 10.0 },
		},
		{
			id: "gpt-4.1",
			name: "GPT-4.1",
			pricingPerM: { input: 2.0, output: 8.0 },
		},
	],
}

export const DEFAULT_QUICK_MODEL: Record<"anthropic" | "openai", string> = {
	anthropic: "claude-haiku-4-5",
	openai: "gpt-4o-mini",
}

export const DEFAULT_DETAILED_MODEL: Record<"anthropic" | "openai", string> = {
	anthropic: "claude-sonnet-4-6",
	openai: "gpt-4o",
}
