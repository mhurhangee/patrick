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

export type Appearance = {
	theme: string;
	mode: ThemeMode;
	scale: number;
};

export type WritingExample = {
	id: string;
	title: string;
	content: string;
};

export type Profile = {
	id: string;
	identity: {
		name: string;
		firm: string;
		role: string;
		practiceContext: string;
	};
	ai: AiSettings;
	prompts: {
		agentpat: string;
	};
	examples: WritingExample[];
	appearance: Appearance;
};

/** Lightweight shape for the profile list (no secrets, no heavy text). */
export type ProfileSummary = {
	id: string;
	name: string;
	firm: string;
};

export function profileSummary(p: Profile): ProfileSummary {
	return { id: p.id, name: p.identity.name, firm: p.identity.firm };
}

export const DEFAULT_AGENTPAT_PROMPT = `You are Patrick, a patent attorney's drafting assistant.

<CAPABILITIES>

<PRACTICECONTEXT>

Current task:
<TASK>

Context:
<OPENDOCUMENTS>

Ground every statement and edit in the pinned sources and the live draft — never invent facts about the record. Edit the active draft only through the document tools, as minimal, targeted tracked changes the attorney can accept or reject.`;

export function createProfile(id: string, name: string): Profile {
	return {
		id,
		identity: { name, firm: "", role: "", practiceContext: "" },
		ai: {
			provider: "anthropic",
			apiKey: "",
			quickModel: DEFAULT_QUICK_MODEL.anthropic,
			detailedModel: DEFAULT_DETAILED_MODEL.anthropic,
			effort: "medium",
		},
		prompts: { agentpat: DEFAULT_AGENTPAT_PROMPT },
		examples: [],
		appearance: { theme: "emerald", mode: "system", scale: 1 },
	};
}
