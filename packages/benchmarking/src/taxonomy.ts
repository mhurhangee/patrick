// The distortion taxonomy (plan §2), defined once. A FALSE statement is the TRUE
// statement minus EXACTLY ONE of these. The generator applies one; the blind
// judge classifies the single difference back to one of these keys; the harness
// accepts a pair only when the two agree. Rendered into both prompts via
// `taxonomyBlock()` so the prose can never drift between them.

export const DISTORTIONS = {
	numeric:
		'change a quantity the source set fixes — period, fee, count, threshold. e.g. "two months" -> "four months"',
	modal:
		'change deontic force — may<->must, optional<->mandatory, "is entitled to"<->"is required to"',
	scope:
		"change a quantifier/coverage — any<->only, all<->some, always<->never, includes<->excludes",
	condition:
		'change a triggering event, the point a period runs from, or a precondition — "from filing"->"from priority"; "while pending"->"after grant"',
	entity:
		"swap the actor/object governed — applicant<->proprietor, European<->international application, opposition<->appeal",
	concept:
		"swap a legal concept for an adjacent one models conflate — novelty<->inventive step, added matter<->lack of clarity",
	attribution:
		"keep the substance correct but cite the WRONG legal basis; use ONLY when the statement explicitly names its basis",
	exception:
		"ignore a governing exception, or add a qualifier/proviso the law does not actually impose",
} as const;

export type DistortionKey = keyof typeof DISTORTIONS;

export const DISTORTION_KEYS = Object.keys(DISTORTIONS) as DistortionKey[];

export function isDistortionKey(s: string): s is DistortionKey {
	return s in DISTORTIONS;
}

/** The `{{DISTORTION_TAXONOMY}}` block pasted verbatim into the prompts. */
export function taxonomyBlock(): string {
	const lines = Object.entries(DISTORTIONS).map(
		([key, desc]) => `- ${key.padEnd(11)}: ${desc}`,
	);
	return [
		"DISTORTION TAXONOMY (each FALSE statement uses EXACTLY ONE)",
		...lines,
	].join("\n");
}
