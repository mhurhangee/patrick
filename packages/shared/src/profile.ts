import {
	DEFAULT_DETAILED_MODEL,
	DEFAULT_QUICK_MODEL,
	type Provider,
} from "./ai-models";

export type AiEffort = "low" | "medium" | "high";
export type ThemeMode = "light" | "dark" | "system";

export type AiSettings = {
	provider: Provider;
	apiKey: string;
	quickModel: string;
	detailedModel: string;
	effort: AiEffort;
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

export function createProfile(id: string, name: string): Profile {
	return {
		id,
		identity: { name, author: "" },
		ai: {
			provider: "anthropic",
			apiKey: "",
			quickModel: DEFAULT_QUICK_MODEL.anthropic,
			detailedModel: DEFAULT_DETAILED_MODEL.anthropic,
			effort: "medium",
		},
		ops: { consumerKey: "", consumerSecret: "" },
		prompts: { agentpat: DEFAULT_AGENTPAT_PROMPT },
		appearance: { theme: "emerald", mode: "system", scale: 1 },
	};
}
