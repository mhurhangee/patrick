export type Provider = "gateway" | "anthropic" | "openai" | "google";

// Rough capability/cost tier. Order in each list is always fast → balanced → expert.
export type ModelTier = "fast" | "balanced" | "expert";

export type CuratedModel = {
	id: string;
	name: string;
	tier: ModelTier;
	pricingPerM?: { input: number; output: number };
	contextWindow: number;
};

// Anthropic / OpenAI / Google direct — the per-provider model lists shown in the
// picker. IDs carry the gateway-style `vendor/` prefix; the model factory strips
// it for direct providers and keeps it for the gateway (which needs the routing form).
const CURATED_MODELS: Record<
	"anthropic" | "openai" | "google",
	CuratedModel[]
> = {
	anthropic: [
		{
			id: "anthropic/claude-haiku-4.5",
			name: "Claude Haiku 4.5",
			tier: "fast",
			pricingPerM: { input: 1.0, output: 5.0 },
			contextWindow: 200_000,
		},
		{
			id: "anthropic/claude-sonnet-4.6",
			name: "Claude Sonnet 4.6",
			tier: "balanced",
			pricingPerM: { input: 3.0, output: 15.0 },
			contextWindow: 1_000_000,
		},
		{
			id: "anthropic/claude-opus-4.8",
			name: "Claude Opus 4.8",
			tier: "expert",
			pricingPerM: { input: 5.0, output: 25.0 },
			contextWindow: 1_000_000,
		},
	],
	openai: [
		{
			id: "openai/gpt-5.4-mini",
			name: "GPT-5.4 Mini",
			tier: "fast",
			pricingPerM: { input: 0.75, output: 4.5 },
			contextWindow: 400_000,
		},
		{
			id: "openai/gpt-5.4",
			name: "GPT-5.4",
			tier: "balanced",
			pricingPerM: { input: 2.5, output: 15.0 },
			contextWindow: 1_100_000,
		},
		{
			id: "openai/gpt-5.5",
			name: "GPT-5.5",
			tier: "expert",
			pricingPerM: { input: 5.0, output: 30.0 },
			contextWindow: 1_000_000,
		},
	],
	google: [
		{
			id: "google/gemini-3.1-flash-lite",
			name: "Gemini 3.1 Flash Lite",
			tier: "fast",
			pricingPerM: { input: 0.25, output: 1.5 },
			contextWindow: 1_000_000,
		},
		{
			id: "google/gemini-3.5-flash",
			name: "Gemini 3.5 Flash",
			tier: "balanced",
			pricingPerM: { input: 1.5, output: 9.0 },
			contextWindow: 1_000_000,
		},
		{
			id: "google/gemini-3.1-pro-preview",
			name: "Gemini 3.1 Pro Preview",
			tier: "expert",
			pricingPerM: { input: 2.0, output: 12.0 },
			contextWindow: 1_000_000,
		},
	],
};

// AI Gateway (Vercel) — mix-and-match across vendors. We reuse the curated lists
// rather than maintain a separate gateway catalogue; the prefixed IDs are already
// valid gateway routing strings.
const GATEWAY_MODELS: CuratedModel[] = [
	...CURATED_MODELS.anthropic,
	...CURATED_MODELS.openai,
	...CURATED_MODELS.google,
];

// Every model, keyed by ID — for pricing/context lookups regardless of provider.
export const MODELS_BY_ID: Record<string, CuratedModel> = Object.fromEntries(
	GATEWAY_MODELS.map((m) => [m.id, m]),
);

// Context window (input-token capacity) for a model id; 200k is a safe floor.
export function contextWindowFor(modelId: string): number {
	return MODELS_BY_ID[modelId]?.contextWindow ?? 200_000;
}

function byTier(models: CuratedModel[], tier: ModelTier): CuratedModel {
	const model = models.find((m) => m.tier === tier) ?? models[0];
	if (!model) throw new Error("Model catalog list is empty");
	return model;
}

// The default model for a provider → the balanced tier (the recommended pick; the
// attorney can choose fast or expert). One model per profile, lockable per chat.
export const DEFAULT_MODEL: Record<Provider, string> = {
	anthropic: byTier(CURATED_MODELS.anthropic, "balanced").id,
	openai: byTier(CURATED_MODELS.openai, "balanced").id,
	google: byTier(CURATED_MODELS.google, "balanced").id,
	gateway: byTier(CURATED_MODELS.anthropic, "balanced").id,
};

/** The recommended model id for a provider (the balanced tier). */
export function recommendedModelFor(provider: Provider): string {
	return DEFAULT_MODEL[provider];
}

/** The cheapest (fast-tier) model for a provider — used for the 1-token key check. */
export function fastModelFor(provider: Provider): string {
	const list =
		provider === "gateway"
			? CURATED_MODELS.anthropic
			: CURATED_MODELS[provider];
	return byTier(list, "fast").id;
}

// A one-line descriptor per tier — derived, so it never drifts from the catalog.
export const TIER_BLURB: Record<ModelTier, string> = {
	fast: "Fast & cheap",
	balanced: "Best all-round",
	expert: "Most capable",
};

/** Compact context-window label: 200000 → "200K", 1_000_000 → "1M". */
export function formatContextWindow(tokens: number): string {
	if (tokens >= 1_000_000) {
		const m = tokens / 1_000_000;
		return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
	}
	return `${Math.round(tokens / 1000)}K`;
}

// Models available to a provider's selects.
export function modelsForProvider(provider: Provider): CuratedModel[] {
	if (provider === "gateway") return GATEWAY_MODELS;
	return CURATED_MODELS[provider] ?? [];
}

type Vendor = "anthropic" | "openai" | "google";

// Input tokens one PDF page costs per vendor (extracted text + a rendered page
// image) — roughly constant across a vendor's models.
const PDF_TOKENS_PER_PAGE: Record<Vendor, number> = {
	anthropic: 1562,
	openai: 944,
	google: 520,
};

export function vendorForModel(modelId: string): Vendor {
	const v = modelId.split("/")[0];
	return v === "openai" || v === "google" ? v : "anthropic";
}

/** Rough input-token cost of sending an N-page PDF to the given model. */
export function estimatePdfTokens(pages: number, modelId: string): number {
	return pages * PDF_TOKENS_PER_PAGE[vendorForModel(modelId)];
}

/**
 * Whether a model supports extended reasoning. Anthropic's fast tier (Haiku)
 * rejects it; every other current model reasons. Read by both the reasoning UI
 * and the server's reasoning options so they can't disagree.
 */
export function supportsReasoning(modelId: string): boolean {
	const model = MODELS_BY_ID[modelId];
	if (!model) return true; // unknown id → assume capable, don't disable the UI
	return !(vendorForModel(modelId) === "anthropic" && model.tier === "fast");
}

/** Rough token estimate for plain text/extracted docx — about 4.5 chars/token. */
export function estimateTextTokens(chars: number): number {
	return Math.round(chars / 4.5);
}
