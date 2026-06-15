// Normalize a user-typed publication number into the forms each provider wants.
// A country prefix is required (it routes the provider). The `google` form is the
// cleaned string as-is (Google resolves with or without a kind code, via
// redirect); the `epodoc` form is country+digits with any kind stripped (OPS
// doesn't take the kind and returns the real one in the response).
export function parseNumber(
	input: string,
): { country: string; epodoc: string; google: string } | null {
	const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
	// Country + a serial containing at least one digit (so a real number, but the
	// serial may carry letters — US RE/D/PP reissues, designs, plant patents).
	const m = /^([A-Z]{2})([0-9A-Z]*\d[0-9A-Z]*)$/.exec(cleaned);
	if (!m) return null;
	const country = m[1] as string;
	// epodoc (OPS, EP/WO only) wants country + the numeric run.
	const digits = /^\d+/.exec(m[2] as string)?.[0] ?? (m[2] as string);
	return { country, epodoc: `${country}${digits}`, google: cleaned };
}
