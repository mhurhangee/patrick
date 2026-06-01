export type Provider = "gateway" | "anthropic" | "openai" | "google"

export type CuratedModel = {
	id: string
	name: string
	pricingPerM?: { input: number; output: number }
}

// Anthropic / OpenAI / Google direct — flat list used for both quick and detailed selects
export const CURATED_MODELS: Record<
	"anthropic" | "openai" | "google",
	CuratedModel[]
> = {
	anthropic: [
		{
			id: "claude-haiku-4-5",
			name: "Claude Haiku 4.5",
			pricingPerM: { input: 1.0, output: 5.0 },
		},
		{
			id: "claude-sonnet-4-6",
			name: "Claude Sonnet 4.6",
			pricingPerM: { input: 3.0, output: 15.0 },
		},
		{
			id: "claude-opus-4-7",
			name: "Claude Opus 4.7",
			pricingPerM: { input: 5.0, output: 25.0 },
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
	google: [
		{
			id: "gemini-2.5-flash",
			name: "Gemini 2.5 Flash",
			pricingPerM: { input: 0.3, output: 2.5 },
		},
		{
			id: "gemini-2.5-pro",
			name: "Gemini 2.5 Pro",
			pricingPerM: { input: 1.25, output: 10.0 },
		},
		{
			id: "gemini-2.0-flash",
			name: "Gemini 2.0 Flash",
			pricingPerM: { input: 0.1, output: 0.4 },
		},
	],
}

// AI Gateway (Vercel) — separate quick/detailed lists, IDs are gateway routing strings
export const GATEWAY_QUICK_MODELS: CuratedModel[] = [
	{
		id: "google/gemini-3.1-flash-lite",
		name: "Gemini 3.1 Flash Lite",
		pricingPerM: { input: 0.25, output: 1.5 },
	},
	{
		id: "anthropic/claude-haiku-4.5",
		name: "Claude Haiku 4.5",
		pricingPerM: { input: 1.0, output: 5.0 },
	},
	{
		id: "openai/gpt-5.4-nano",
		name: "GPT-5.4 Nano",
		pricingPerM: { input: 0.2, output: 1.25 },
	},
	{
		id: "deepseek/deepseek-v4-flash",
		name: "DeepSeek V4 Flash",
		pricingPerM: { input: 0.14, output: 0.28 },
	},
	{
		id: "nvidia/nemotron-nano-9b-v2",
		name: "Nemotron Nano 9B v2",
		pricingPerM: { input: 0.06, output: 0.23 },
	},
	{
		id: "amazon/nova-micro",
		name: "Nova Micro",
		pricingPerM: { input: 0.04, output: 0.14 },
	},
	{
		id: "meta/llama-3.1-8b",
		name: "Llama 3.1 8B",
		pricingPerM: { input: 0.1, output: 0.1 },
	},
]

export const GATEWAY_DETAILED_MODELS: CuratedModel[] = [
	{
		id: "anthropic/claude-sonnet-4.6",
		name: "Claude Sonnet 4.6",
		pricingPerM: { input: 3.0, output: 15.0 },
	},
	{
		id: "anthropic/claude-opus-4.7",
		name: "Claude Opus 4.7",
		pricingPerM: { input: 5.0, output: 25.0 },
	},
	{
		id: "openai/gpt-5.5",
		name: "GPT-5.5",
		pricingPerM: { input: 5.0, output: 30.0 },
	},
	{
		id: "google/gemini-3.5-flash",
		name: "Gemini 3.5 Flash",
		pricingPerM: { input: 1.5, output: 9.0 },
	},
	{
		id: "meta/llama-4-maverick",
		name: "Llama 4 Maverick",
		pricingPerM: { input: 0.24, output: 0.97 },
	},
	{
		id: "amazon/nova-pro",
		name: "Nova Pro",
		pricingPerM: { input: 0.8, output: 3.2 },
	},
	{
		id: "deepseek/deepseek-v4-pro",
		name: "DeepSeek V4 Pro",
		pricingPerM: { input: 0.43, output: 0.87 },
	},
]

export const DEFAULT_QUICK_MODEL: Record<Provider, string> = {
	anthropic: "claude-haiku-4-5",
	openai: "gpt-4o-mini",
	google: "gemini-2.5-flash",
	gateway: GATEWAY_QUICK_MODELS[0].id,
}

export const DEFAULT_DETAILED_MODEL: Record<Provider, string> = {
	anthropic: "claude-sonnet-4-6",
	openai: "gpt-4o",
	google: "gemini-2.5-pro",
	gateway: GATEWAY_DETAILED_MODELS[0].id,
}
