import {
	assembleSystemPrompt,
	type PinnedSource,
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
// draft is read live through the draft tools. This keeps the system prefix
// stable and cacheable for the whole chat.

function manifest(
	pinned: PinnedSource[],
	activeDraft: string | null,
	available: AvailableDoc[],
	charts: string,
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
			`Active draft: ${activeDraft} — the document you edit. Use the draft tools ` +
				"(read_draft / edit_paragraph / add_draft_comment) to read its current state and make " +
				"tracked changes the attorney reviews in Word. Don't reproduce it in chat; work on it through the tools.",
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
	// Existing claim charts the agent can extend (create_chart / parse_claim /
	// add_reference / run_analysis target one by id) — never their content, just id + shape.
	if (charts) {
		lines.push("");
		lines.push(
			"Claim charts in this matter (read one with read_chart, extend one by its id, or create_chart for a new one):",
		);
		lines.push(charts);
	}
	return lines.join("\n");
}

// Assemble the system prompt: Patrick's capabilities/primer, then the attorney's
// block "middle" (their `## Header` sections), then the runtime task + the context
// manifest. `middle` is the chat's frozen instructions, already resolved by the
// caller — an empty middle is honoured (it just drops out of the assembly).
export function buildSystemPrompt(
	task: Task,
	pinned: PinnedSource[],
	activeDraft: string | null,
	available: AvailableDoc[],
	charts: string,
	middle: string,
): string {
	return assembleSystemPrompt(
		middle.trim(),
		taskBlock(task),
		manifest(pinned, activeDraft, available, charts),
	);
}
