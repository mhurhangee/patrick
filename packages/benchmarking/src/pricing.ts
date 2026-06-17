import { MODELS_BY_ID } from "@patrick/shared";

// Estimate $ cost from token counts using the model catalog's pricingPerM. These
// are list prices and an estimate — verify against your Gateway invoice. Returns
// null for a model not in the catalog (report tokens only).
function estimateCost(
	modelId: string,
	input: number,
	output: number,
): number | null {
	const p = MODELS_BY_ID[modelId]?.pricingPerM;
	if (!p) return null;
	return (input / 1e6) * p.input + (output / 1e6) * p.output;
}

/** "12,345 in · 6,789 out · ~$0.42" (cost omitted if the model isn't priced). */
export function usageLine(
	modelId: string,
	input: number,
	output: number,
): string {
	const cost = estimateCost(modelId, input, output);
	const n = (x: number): string => x.toLocaleString("en-US");
	return `${n(input)} in · ${n(output)} out${cost === null ? "" : ` · ~$${cost.toFixed(2)}`}`;
}
