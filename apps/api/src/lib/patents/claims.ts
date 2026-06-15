import type { Claim } from "./types";

/**
 * Regroup running claim text into numbered claims at the LINE level. Used for
 * any source where claim numbers live in the TEXT rather than markup: EPO OPS
 * (EP segment arrays + WO blobs) and Google Patents' OCR'd WO pages. Join the
 * pieces, split on newlines, and start a new claim on a line opening with a
 * number GREATER than the last claim's — claim numbers only increase (a
 * "Reserved" gap still jumps up), so this admits real claims while rejecting a
 * lower-numbered enumerated sub-clause (e.g. "3. a housing" inside claim 5)
 * that would otherwise fragment the set. `lines[0]` is the preamble; the rest
 * are sub-clauses. Lines before the first numbered claim (a "Claims" /
 * "WHAT IS CLAIMED IS:" header) are dropped.
 */
export function groupClaims(pieces: string[]): Claim[] {
	const claims: Claim[] = [];
	let lastNum = 0;
	for (const raw of pieces.join("\n").split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		const m = /^(\d+)\.\s+([\s\S]*)$/.exec(line);
		const n = m ? Number(m[1]) : 0;
		if (m && n > lastNum) {
			claims.push({ num: m[1] as string, lines: [(m[2] as string).trim()] });
			lastNum = n;
		} else if (claims.length > 0) {
			(claims[claims.length - 1] as Claim).lines.push(line);
		}
	}
	return claims;
}
