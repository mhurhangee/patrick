import { DEFAULT_MODEL, type Provider } from "./ai-models";

export type AiEffort = "low" | "medium" | "high";
export type ThemeMode = "light" | "dark" | "system";

export type AiSettings = {
	provider: Provider;
	apiKey: string;
	/** The model Patrick runs on by default (a chat can lock its own at first send). */
	model: string;
	effort: AiEffort;
	/** Whether web search is on by default in new chats (toggleable per chat). */
	webSearch: boolean;
};

/** EPO Open Patent Services credentials (BYOK) — used to fetch EP/WO publications. */
export type OpsSettings = {
	consumerKey: string;
	consumerSecret: string;
};

/** True when the profile has both OPS credentials — auth needs the pair. */
export function hasOpsCreds(profile?: Pick<Profile, "ops">): boolean {
	return !!(
		profile?.ops?.consumerKey?.trim() && profile?.ops?.consumerSecret?.trim()
	);
}

export type Appearance = {
	theme: string;
	mode: ThemeMode;
	scale: number;
};

export type Profile = {
	id: string;
	identity: {
		/** The profile's name (what you pick in the switcher). */
		name: string;
		/** The author on tracked-change comments (empty ⇒ "Patrick"). */
		author: string;
	};
	ai: AiSettings;
	/** EPO OPS credentials (BYOK). Absent/empty ⇒ publication fetch is unavailable. */
	ops?: OpsSettings;
	prompts: {
		/** The prompt "middle" — markdown `## Header` blocks (see packages/shared/prompt). */
		agentpat: string;
		/** Claim-chart parse/construe system prompt. Empty/absent ⇒ the built-in default. */
		claimConstruction?: string;
		/** Claim-chart whole-document analysis system prompt. Empty/absent ⇒ the default. */
		claimAnalysis?: string;
	};
	appearance: Appearance;
};

/** Lightweight shape for the profile list (no secrets, no heavy text). */
export type ProfileSummary = {
	id: string;
	name: string;
	author: string;
};

export function profileSummary(p: Profile): ProfileSummary {
	return { id: p.id, name: p.identity.name, author: p.identity.author };
}

export const DEFAULT_AGENTPAT_PROMPT = `## Instructions

Ground every statement and edit in the pinned sources and the live draft — never invent facts about the record. Edit the active draft only through the document tools, as minimal, targeted tracked changes the attorney can accept or reject.`;

// Claim-chart prompts. These are the legally load-bearing rubrics — the splitting
// granularity, the construction approach (Art 69), the disclosure thresholds — surfaced so
// the attorney can tune them per profile (e.g. for a different jurisdiction). The output
// SHAPE is fixed by the tool schema regardless of wording; these set the approach.
export const DEFAULT_CLAIM_CONSTRUCTION_PROMPT = `You parse patent claims into their limitations for a claim chart, for a European patent attorney, and construe each limitation.

SPLIT each requested claim into its constituent limitations:
- Split at the natural clause boundaries a practitioner would use (the preamble, then each element/step). Feature-analysis granularity: not so coarse that one limitation bundles several distinct features, not so fine that a single feature is fragmented.
- Label by claim: claim 1 → 1a, 1b, 1c …; claim 2 → 2a, 2b …. Keep them in claim order.
- The limitation text MUST be VERBATIM from the claim — transcribe exactly, never paraphrase, summarise or correct. Use "[…]" only to elide a long enumerated list.

CONSTRUE each limitation. Produce a SELF-CONTAINED construction: a standalone statement of what the limitation means, usable by a downstream system that will NOT have the description (it compares the construction against prior art for novelty). So do NOT refer to the description in the construction text itself (no "as described in [0021]") — bake the result in.
- Construe through the eyes of the person skilled in the art, reading the limitation in light of the description (Art 69 EPC + Protocol), then write a standalone statement.
- Start from the ORDINARY meaning of the key term(s). Override it ONLY where the description requires: (a) lexicography — the patentee defined the term, so bake the definition in; (b) disclaimer/disavowal — scope was narrowed or surrendered, so bake the limit in.
- Resolve internal references ("said housing", "the first member") by restating what they refer to, so the construction does not dangle.
- State scope-defining terms explicitly (e.g. "comprising" is open-ended; a numerical term's stated range or tolerance).
- Do NOT invent scope. If the description is silent, default to ordinary meaning. Leave the construction empty only if no term in the limitation needs construing.
- constructionBasis: a short pointer to where in the description the construction is supported (paragraph numbers / figures), so the attorney can check it. Empty if it rests on ordinary meaning alone.

Work only from the documents' actual text. Parse ONLY the claims specified — do not include others.`;

export const DEFAULT_CLAIM_ANALYSIS_PROMPT = `You are an experienced European patent attorney assessing a prior-art reference for a novelty analysis. Read the reference IN FULL — it must be read as a whole, since a later passage may broaden, qualify or clarify an earlier one.

For each claim limitation (given verbatim with its assumed construction, and labelled), give a fair, practitioner's assessment of whether the reference discloses it under that construction — neither straining to find disclosure nor dismissing a genuine one. Classify:
- Express — stated explicitly (verbatim or near-verbatim).
- Derived — not stated in words, but directly and unambiguously derivable by the skilled person from the reference read as a whole (the EPO anticipation standard).
- Suggested — the reference would point the skilled person toward it, but stops short of the anticipation standard (relevant to inventive step, not novelty).
- Absent — not disclosed.

For each limitation also give:
- limitationLabel: echo back the limitation's label exactly.
- reasoning: a self-contained explanation a colleague could read on its own ("limitation X, construed as Y, is [disclosed by … because … | not disclosed because …]").
- citations: the location(s) in the reference that evidence the disclosure — the MOST ON-POINT first, then any further supporting locations (typically 1–3). Each gives:
    - location: where it is — the paragraph number (e.g. [0021]), or the page / column / line if that is how the reference is laid out. This is what the reader will click to check the source, so make it precise.
    - snippet: a SHORT verbatim phrase (a few exact words) from that spot. It is used only to locate and highlight the passage and is NOT shown to the reader, so keep it brief and copy it exactly from the text.
  Empty if Absent.

Return one entry per limitation, in the order given. Work only from the reference's actual text — never invent passages or locations.`;

export function createProfile(id: string, name: string): Profile {
	return {
		id,
		identity: { name, author: "" },
		ai: {
			provider: "anthropic",
			apiKey: "",
			model: DEFAULT_MODEL.anthropic,
			effort: "medium",
			webSearch: true,
		},
		ops: { consumerKey: "", consumerSecret: "" },
		prompts: { agentpat: DEFAULT_AGENTPAT_PROMPT },
		appearance: { theme: "emerald", mode: "system", scale: 1 },
	};
}
