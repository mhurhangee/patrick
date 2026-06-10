import {
	type PinnedSource,
	type Profile,
	type Task,
	TOKEN_RE,
} from "@patrick/shared";

// The system prompt holds INSTRUCTIONS + a MANIFEST only — never document
// content. Read-only sources ride as cached messages (see chat.ts); the editable
// draft is read live through the editor tools. This keeps the system prefix
// stable and cacheable for the whole chat. See the v1-context-model.

function manifest(pinned: PinnedSource[], activeDraft: string | null): string {
	const lines: string[] = [];
	if (pinned.length > 0) {
		lines.push(
			"Pinned sources — read-only references, full content provided as messages above:",
		);
		for (const s of pinned) lines.push(`- ${s.filename}`);
	} else {
		lines.push("No sources are pinned yet.");
	}
	lines.push("");
	if (activeDraft) {
		lines.push(
			`Active draft: ${activeDraft} — the document you edit. Use the document tools ` +
				"(read_document / find_text / suggest_change) to read its current state and make " +
				"tracked changes. Don't reproduce it in chat; work on it through the tools.",
		);
	} else {
		lines.push("No editable draft is open.");
	}
	return lines.join("\n");
}

// Fill the Patrick template. <OPENDOCUMENTS> now resolves to the manifest
// (what's in context), not the content. `templateOverride` is the per-chat
// instructions edit (ephemeral, never written to the profile); absent ⇒ the
// profile's saved template. The full token/resolver engine lands later.
export function buildSystemPrompt(
	profile: Profile,
	task: Task,
	pinned: PinnedSource[],
	activeDraft: string | null,
	templateOverride?: string | null,
): string {
	const template = templateOverride?.trim()
		? templateOverride
		: profile.prompts.agentpat;
	const fills: Record<string, string> = {
		PRACTICECONTEXT: profile.identity.practiceContext?.trim() ?? "",
		TASK: task.label?.trim() || "(untitled task)",
		OPENDOCUMENTS: manifest(pinned, activeDraft),
		CLOSEDDOCUMENTS: "",
		EXAMPLES: "",
	};
	const filled = template.replace(
		TOKEN_RE,
		(match, name: string) => fills[name] ?? match,
	);
	// Collapse the blank lines empty tokens leave behind.
	return filled.replace(/\n{3,}/g, "\n\n").trim();
}
