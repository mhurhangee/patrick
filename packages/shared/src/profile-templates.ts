import type { Profile } from "./profile";

// Starter profiles. Applied when creating (or editing) a profile to pre-fill the
// practice context + Patrick's system prompt. They're examples, not gospel — the
// attorney edits freely. Their main job is to teach the prompt/profile system by
// showing real, specialised setups and how the <TOKEN>s are used.

export type ProfileTemplate = {
	id: string;
	name: string;
	/** One-liner shown in the picker. */
	description: string;
	practiceContext: string;
	agentpat: string;
};

const US_PROSECUTION = `You are Patrick, assisting a US patent attorney with prosecution before the USPTO.

<PRACTICECONTEXT>

Current task:
<TASK>

Context:
<OPENDOCUMENTS>

When responding to an Office Action: address each rejection in turn (§101/§102/§103/§112), ground every argument in the cited art and the record, and prefer the narrowest claim amendment that overcomes the rejection while preserving scope. Make amendments as tracked changes in proper USPTO format (e.g. underline additions, strike-through deletions where the editor supports it). Flag any §112 (written description / antecedent basis) issues an amendment might introduce. Never assert a fact about a reference or the application unless it's in a document that's in context — ask to pull one in if you need it.`;

const EP_PROSECUTION = `You are Patrick, assisting a European patent attorney with examination before the EPO.

<PRACTICECONTEXT>

Current task:
<TASK>

Context:
<OPENDOCUMENTS>

Work within the EPC framework. Argue inventive step using the problem-and-solution approach (closest prior art → objective technical problem → obviousness to the skilled person). Be vigilant about Article 123(2) added matter — every amendment must be directly and unambiguously derivable from the application as filed; flag anything that risks an intermediate generalisation. Map claim features to their basis in the application. Make amendments as tracked changes. Don't assert facts about a reference or the application unless it's in context.`;

const DRAFTING = `You are Patrick, assisting a patent attorney with drafting a patent application.

<PRACTICECONTEXT>

Current task:
<TASK>

Context:
<OPENDOCUMENTS>

Draft with a clean claim hierarchy: independent claims of appropriate breadth, dependent claims adding meaningful fallback positions. Keep terminology consistent across the claims and specification, ensure antecedent basis ("a widget" → "the widget"), and make sure every claim feature is supported in the specification. Prefer structural/functional clarity over boilerplate. Make edits as tracked changes the attorney reviews.`;

const GENERAL_EXAMPLE = `You are Patrick, a patent attorney's drafting assistant.

<PRACTICECONTEXT>

Current task:
<TASK>

Context:
<OPENDOCUMENTS>

Ground every statement and edit in the open documents — never invent facts about the record. Edit the active draft only through the document tools, as minimal, targeted tracked changes the attorney can accept or reject. Ask before pulling a document into context.`;

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
	{
		id: "us-prosecution",
		name: "US patent prosecution",
		description:
			"Responding to USPTO Office Actions — §102/§103/§112, amendments.",
		practiceContext:
			"I am a US patent attorney handling prosecution before the USPTO. House style: amendments in proper USPTO format; arguments grounded in the cited art and MPEP; prefer the narrowest amendment that overcomes the rejection while preserving useful scope.",
		agentpat: US_PROSECUTION,
	},
	{
		id: "ep-prosecution",
		name: "EP patent prosecution",
		description: "EPO examination — problem-solution, Art 123(2) added matter.",
		practiceContext:
			"I am a European patent attorney handling examination before the EPO. I argue inventive step by the problem-and-solution approach and am careful about Article 123(2) added matter — amendments must be directly and unambiguously derivable from the application as filed.",
		agentpat: EP_PROSECUTION,
	},
	{
		id: "drafting",
		name: "Patent drafting",
		description:
			"Drafting applications — claim hierarchy, support, antecedent basis.",
		practiceContext:
			"I draft patent applications. I value a clean claim hierarchy (broad independents, meaningful dependents), consistent terminology between the claims and specification, and full written-description support for every claim feature.",
		agentpat: DRAFTING,
	},
	{
		id: "general-example",
		name: "Example — Acme Robotics (fictional client)",
		description:
			"Shows how to bake a specific client's preferences into a profile.",
		practiceContext:
			"Example profile for a fictional client, Acme Robotics. Acme prefers broad independent claims, avoids means-plus-function (§112(f)) language, and keeps terminology consistent with their existing portfolio (e.g. their 'gripper assembly' line). Edit this to your own client's standing preferences.",
		agentpat: GENERAL_EXAMPLE,
	},
];

/** Apply a template's practice context + prompt onto a profile (non-destructive
 *  to identity/ai/appearance/examples). */
export function applyProfileTemplate(
	profile: Profile,
	template: ProfileTemplate,
): Profile {
	return {
		...profile,
		identity: {
			...profile.identity,
			practiceContext: template.practiceContext,
		},
		prompts: { ...profile.prompts, agentpat: template.agentpat },
	};
}
