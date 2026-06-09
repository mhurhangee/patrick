export type AiProvider = "anthropic" | "openai" | "google" | "gateway";
export type AiEffort = "low" | "medium" | "high";
export type ThemeMode = "light" | "dark" | "system";

export type AiSettings = {
	provider: AiProvider;
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

export const DEFAULT_AGENTPAT_PROMPT = `You are AgentPat, a patent attorney's drafting assistant.

<PRACTICECONTEXT>

Current task:
<TASK>

Open documents (full context):
<OPENDOCUMENTS>

Work from the open documents. Be surgical; ground every edit in the record.`;

export function createProfile(id: string, name: string): Profile {
	return {
		id,
		identity: { name, firm: "", role: "", practiceContext: "" },
		ai: {
			provider: "anthropic",
			apiKey: "",
			quickModel: "claude-haiku-4-5",
			detailedModel: "claude-sonnet-4-5",
			effort: "medium",
		},
		prompts: { agentpat: DEFAULT_AGENTPAT_PROMPT },
		examples: [],
		appearance: { theme: "emerald", mode: "system", scale: 1 },
	};
}
