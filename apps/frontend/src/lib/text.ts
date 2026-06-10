/** First letters of the first two words, e.g. "Jane Smith" → "JS". */
export function initialsOf(name: string): string {
	const letters = name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? "");
	return letters.join("") || "?";
}
