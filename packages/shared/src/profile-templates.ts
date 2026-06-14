import type { Profile } from "./profile";

// Starter prompts. Applied when creating (or editing) a profile to pre-fill the
// block "middle" — practice context + instructions, written as `## Header`
// blocks. They're examples, not gospel — the attorney edits freely.

export type ProfileTemplate = {
	id: string;
	name: string;
	/** One-liner shown in the picker. */
	description: string;
	/** The prompt middle — `## Header` blocks. */
	agentpat: string;
};

const US_PROSECUTION = `## Practice context

I'm a US patent attorney handling prosecution before the USPTO. House style: amendments in proper USPTO format; arguments grounded in the cited art and the MPEP; prefer the narrowest amendment that overcomes the rejection while preserving useful scope.

## Instructions

When responding to an Office Action: address each rejection in turn (§101/§102/§103/§112), ground every argument in the cited art and the record, and prefer the narrowest claim amendment that overcomes the rejection while preserving scope. Make amendments as tracked changes in proper USPTO format (underline additions, strike-through deletions where the editor supports it). Flag any §112 (written description / antecedent basis) issues an amendment might introduce. Never assert a fact about a reference or the application unless it's in a document that's in context — ask to pull one in if you need it.`;

const EP_PROSECUTION = `## Practice context

I'm a European patent attorney handling examination before the EPO. I argue inventive step by the problem-and-solution approach and am careful about Article 123(2) added matter — amendments must be directly and unambiguously derivable from the application as filed.

## Instructions

Work within the EPC framework. Argue inventive step using the problem-and-solution approach (closest prior art → objective technical problem → obviousness to the skilled person). Be vigilant about Article 123(2) added matter — every amendment must be directly and unambiguously derivable from the application as filed; flag anything that risks an intermediate generalisation. Map claim features to their basis in the application. Make amendments as tracked changes. Don't assert facts about a reference or the application unless it's in context.`;

const DRAFTING = `## Practice context

I draft patent applications. I value a clean claim hierarchy (broad independents, meaningful dependents), consistent terminology between the claims and specification, and full written-description support for every claim feature.

## Instructions

Draft with a clean claim hierarchy: independent claims of appropriate breadth, dependent claims adding meaningful fallback positions. Keep terminology consistent across the claims and specification, ensure antecedent basis ("a widget" → "the widget"), and make sure every claim feature is supported in the specification. Prefer structural/functional clarity over boilerplate. Make edits as tracked changes the attorney reviews.`;

const GENERAL_EXAMPLE = `## Practice context

Example profile for a fictional client, Acme Robotics. Acme prefers broad independent claims, avoids means-plus-function (§112(f)) language, and keeps terminology consistent with their existing portfolio (e.g. their "gripper assembly" line). Edit this to your own client's standing preferences.

## Instructions

Ground every statement and edit in the open documents — never invent facts about the record. Edit the active draft only through the document tools, as minimal, targeted tracked changes the attorney can accept or reject. Ask before pulling a document into context.`;

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
	{
		id: "us-prosecution",
		name: "US patent prosecution",
		description:
			"Responding to USPTO Office Actions — §102/§103/§112, amendments.",
		agentpat: US_PROSECUTION,
	},
	{
		id: "ep-prosecution",
		name: "EP patent prosecution",
		description: "EPO examination — problem-solution, Art 123(2) added matter.",
		agentpat: EP_PROSECUTION,
	},
	{
		id: "drafting",
		name: "Patent drafting",
		description:
			"Drafting applications — claim hierarchy, support, antecedent basis.",
		agentpat: DRAFTING,
	},
	{
		id: "general-example",
		name: "Example — Acme Robotics (fictional client)",
		description:
			"Shows how to bake a specific client's preferences into a profile.",
		agentpat: GENERAL_EXAMPLE,
	},
];

/** Apply a template's prompt onto a profile (non-destructive to the rest). */
export function applyProfileTemplate(
	profile: Profile,
	template: ProfileTemplate,
): Profile {
	return {
		...profile,
		prompts: { ...profile.prompts, agentpat: template.agentpat },
	};
}
