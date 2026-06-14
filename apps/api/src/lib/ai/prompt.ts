import {
	assembleSystemPrompt,
	type PinnedSource,
	type Profile,
	type Task,
} from "@patrick/shared";

/** A folder document not yet in context — awareness only (filename + label). */
export type AvailableDoc = { filename: string; label?: string };

// The task block injected into every chat: the short name + the living brief
// (what the matter is, the objective, the running record).
function taskBlock(task: Task): string {
	const parts: string[] = [];
	const name = task.name?.trim();
	const brief = task.brief?.trim();
	if (name) parts.push(name);
	if (brief) parts.push(brief);
	if (parts.length === 0) parts.push("(untitled task)");
	return parts.join("\n");
}

// The system prompt holds INSTRUCTIONS + a MANIFEST only — never document
// content. Read-only sources ride as cached messages (see chat.ts); the editable
// draft is read live through the editor tools. This keeps the system prefix
// stable and cacheable for the whole chat.

function manifest(
	pinned: PinnedSource[],
	activeDraft: string | null,
	available: AvailableDoc[],
): string {
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
	// Folder awareness: other documents the attorney has, by filename + their
	// label — never content. Patrick can propose pulling one in via requestOpenFile
	// (the attorney accepts); it can't read them until then.
	if (available.length > 0) {
		lines.push("");
		lines.push(
			"Also in this matter, not yet in context (call requestOpenFile to ask the attorney to add one if you need it — you cannot read it until they accept):",
		);
		for (const d of available)
			lines.push(`- ${d.filename}${d.label ? ` — ${d.label}` : ""}`);
	}
	return lines.join("\n");
}

// Assemble the system prompt: Patrick's capabilities/primer, then the attorney's
// block "middle" (their `## Header` sections), then the runtime task + the
// context manifest. `templateOverride` is the per-chat instructions edit
// (ephemeral, never written to the profile); absent ⇒ the profile's saved middle.
export function buildSystemPrompt(
	profile: Profile,
	task: Task,
	pinned: PinnedSource[],
	activeDraft: string | null,
	available: AvailableDoc[],
	templateOverride?: string | null,
): string {
	const middle = (
		templateOverride?.trim() ? templateOverride : profile.prompts.agentpat
	).trim();
	return assembleSystemPrompt(
		middle,
		taskBlock(task),
		manifest(pinned, activeDraft, available),
	);
}
