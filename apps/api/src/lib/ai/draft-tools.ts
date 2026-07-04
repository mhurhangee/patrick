import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	ADD_DRAFT_COMMENT_TOOL,
	type DRAFT_TOOL_NAMES,
	EDIT_PARAGRAPH_TOOL,
	READ_DRAFT_COMMENTS_TOOL,
	READ_DRAFT_TOOL,
} from "@patrick/shared";
import { tool } from "ai";
import { z } from "zod";
import { danceFor } from "../docx/dance";
import {
	type DraftRun,
	listComments,
	REDLINE_AUTHOR,
	readDraftRuns,
} from "../docx/redline";

// The draft-editing tools: server-executed against the active draft on disk
// (headless tracked changes — the attorney reviews them in Word). Writes go
// through the dance: applied immediately when the draft is closed, parked and
// applied on close when it's open in Word/LibreOffice. One paragraph per edit.

const noDraft = {
	error:
		"No active draft. Propose one first: createDraft (a fresh document) or requestUnlock (an editable copy of an original).",
};

// Render one run in CriticMarkup so the agent sees the full review state:
// insertions {++…++}, deletions {--…--}, tagged with the author when it's the
// attorney's own change rather than Patrick's.
function renderRun(run: DraftRun): string {
	if (run.kind === "text") return run.text;
	const tag =
		run.author && run.author !== REDLINE_AUTHOR ? `[${run.author}]` : "";
	return run.kind === "ins"
		? `{++${run.text}++}${tag}`
		: `{--${run.text}--}${tag}`;
}

/** Bind the draft tools to the task folder + this turn's active draft. */
export function buildDraftTools(folder: string, activeDraft: string | null) {
	// The agent only ever sees basenames; never let a path reach outside the folder.
	const draft = activeDraft ? basename(activeDraft) : null;

	const draftBytes = async (): Promise<Uint8Array | null> => {
		if (!draft) return null;
		try {
			return new Uint8Array(await readFile(join(folder, draft)));
		} catch {
			return null;
		}
	};

	const readDraft = tool({
		description:
			"Read the active draft, paragraph by paragraph, showing the FULL review state — [n] is the paragraph number (used by add_draft_comment). Pending tracked changes are shown inline: {++inserted++} and {--deleted--}, tagged {++…++}[author] when the author isn't you. To get edit_paragraph's target_text, read a paragraph AS IF ACCEPTED — keep the {++inserted++} text, drop the {--deleted--} text. Comments are listed under the paragraph they anchor to (an attorney comment mentioning @Patrick is an instruction to you). The draft lives on disk and the attorney edits it in Word too, so always read fresh before editing.",
		inputSchema: z.object({}),
		execute: async () => {
			const bytes = await draftBytes();
			if (!draft || !bytes) return noDraft;
			const paragraphs = await readDraftRuns(bytes);
			const comments = await listComments(bytes);
			const status = await danceFor(folder, draft).status();

			const byParagraph = new Map<number, typeof comments>();
			for (const c of comments) {
				const key = c.paragraphIndex ?? 0;
				(byParagraph.get(key) ?? byParagraph.set(key, []).get(key) ?? []).push(
					c,
				);
			}

			const lines: string[] = [];
			for (const p of paragraphs) {
				const text = p.runs.map(renderRun).join("");
				if (!text.trim() && !byParagraph.has(p.index)) continue;
				lines.push(`[${p.index}]${p.hasRevisions ? " (r)" : ""} ${text}`);
				for (const c of byParagraph.get(p.index) ?? [])
					lines.push(`    ↳ comment [${c.author}]: ${c.text}`);
			}
			// Comments whose anchor we couldn't place (rare) still surface.
			for (const c of byParagraph.get(0) ?? [])
				lines.push(`↳ comment [${c.author}]: ${c.text}`);

			const note = status.openInEditor
				? "\n\n(The attorney has the draft open in Word right now — your edits will be parked and applied when they close it. Unsaved changes of theirs aren't visible to you yet.)"
				: "";
			return `# ${draft}\n${lines.join("\n") || "(the draft is empty)"}${note}`;
		},
	});

	const editParagraph = tool({
		description:
			"Rewrite ONE paragraph of the active draft as a native tracked change (redline) the attorney reviews in Word. Quote the paragraph's current text from read_draft as target_text (enough of it to be unique — the full paragraph is safest) and give the complete revised paragraph as new_text. One paragraph per call — for a multi-paragraph revision, make one call per paragraph. Re-editing a paragraph that already has your pending redline replaces that redline (the attorney always reviews original → your latest). If the draft is open in Word the edit parks and lands when the attorney closes it.",
		inputSchema: z.object({
			target_text: z
				.string()
				.min(1)
				.describe(
					"The paragraph's CURRENT text as shown by read_draft — verbatim, and unique to that paragraph",
				),
			new_text: z
				.string()
				.describe("The complete revised text of the paragraph"),
		}),
		execute: async ({ target_text, new_text }) => {
			if (!draft) return noDraft;
			const outcome = await danceFor(folder, draft).applyOrPark({
				kind: "redline",
				edit: { targetText: target_text, newText: new_text },
			});
			if (outcome.status === "failed") return { error: outcome.reason };
			if (outcome.status === "parked")
				return {
					parked: true,
					note: `The draft is open in Word — this redline (and ${outcome.parkedEdits - 1} other parked edit(s)) will be applied when the attorney closes it. Don't retry.`,
				};
			return { applied: true };
		},
	});

	const addDraftComment = tool({
		description:
			"Add a Word comment to the active draft, anchored to text in one paragraph — for margin notes the attorney reads in Word: flagging a risk, explaining an edit, or replying to their @Patrick comment. Not for edits (use edit_paragraph). Anchor to text you are NOT about to redline (a redline fragments the anchor); when commenting and editing the same paragraph, add the comment first.",
		inputSchema: z.object({
			paragraph: z
				.number()
				.int()
				.min(1)
				.describe("The paragraph number [n] from read_draft"),
			anchor_text: z
				.string()
				.min(1)
				.describe(
					"Verbatim text within that paragraph to attach the comment to",
				),
			text: z.string().min(1).describe("The comment"),
		}),
		execute: async ({ paragraph, anchor_text, text }) => {
			if (!draft) return noDraft;
			const outcome = await danceFor(folder, draft).applyOrPark({
				kind: "comment",
				request: { paragraphIndex: paragraph, textToFind: anchor_text, text },
			});
			if (outcome.status === "failed") return { error: outcome.reason };
			if (outcome.status === "parked")
				return {
					parked: true,
					note: "The draft is open in Word — the comment will be added when the attorney closes it. Don't retry.",
				};
			return { applied: true };
		},
	});

	const readDraftComments = tool({
		description:
			"Read all comments in the active draft (author + text) — including the attorney's @Patrick comments, which are instructions addressed to you.",
		inputSchema: z.object({}),
		execute: async () => {
			const bytes = await draftBytes();
			if (!draft || !bytes) return noDraft;
			const comments = await listComments(bytes);
			if (comments.length === 0) return { comments: [] };
			return {
				comments: comments.map((c) => ({ author: c.author, text: c.text })),
			};
		},
	});

	return {
		[READ_DRAFT_TOOL]: readDraft,
		[EDIT_PARAGRAPH_TOOL]: editParagraph,
		[ADD_DRAFT_COMMENT_TOOL]: addDraftComment,
		[READ_DRAFT_COMMENTS_TOOL]: readDraftComments,
	} satisfies Record<(typeof DRAFT_TOOL_NAMES)[number], unknown>;
}
