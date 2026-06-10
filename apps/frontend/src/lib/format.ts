/** Compact token count, e.g. 950 → "950", 12_300 → "12.3k", 120_000 → "120k". */
export function formatTokens(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
	return `${n}`;
}
