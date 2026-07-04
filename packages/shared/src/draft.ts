// The draft-editing contract: Patrick edits the active .docx on disk as native
// tracked changes (headless — no in-app editor); the attorney reviews and
// accepts/rejects them in Word. Tool names live here so the server tools, the
// chat UI's tool routing, and the prompt can't drift apart.

export const READ_DRAFT_TOOL = "read_draft";
export const EDIT_PARAGRAPH_TOOL = "edit_paragraph";
export const ADD_DRAFT_COMMENT_TOOL = "add_draft_comment";
export const READ_DRAFT_COMMENTS_TOOL = "read_draft_comments";

/** Tools that write to the draft file (the UI refreshes the draft panel on these). */
export const MUTATING_DRAFT_TOOLS = [
	EDIT_PARAGRAPH_TOOL,
	ADD_DRAFT_COMMENT_TOOL,
] as const;

export const DRAFT_TOOL_NAMES = [
	READ_DRAFT_TOOL,
	READ_DRAFT_COMMENTS_TOOL,
	...MUTATING_DRAFT_TOOLS,
] as const;

/** A comment living in the draft (word/comments.xml). */
export type DraftComment = {
	id: string;
	author: string;
	text: string;
	/** 1-based paragraph the comment is anchored in (0 = unanchored/unknown). */
	paragraphIndex?: number;
};

/**
 * The dance, observable: whether a Word/LibreOffice lock is held on the draft,
 * how many of Patrick's edits are parked waiting for the write window, when the
 * file last changed on disk, and any attorney comments addressed to Patrick
 * (`@Patrick …`) currently in the document.
 */
export type DraftStatus = {
	exists: boolean;
	/** A Word (`~$…`) or LibreOffice (`.~lock.…#`) lock marker is present. */
	openInEditor: boolean;
	/** Redlines/comments computed but waiting for the draft to be closed. */
	parkedEdits: number;
	/** What's waiting — one summary per parked op, so the panel can show
	 *  "queued, close the doc to apply" against the affected change.
	 *  `paragraphIndex` is set on resolve ops so the UI matches them structurally. */
	parkedOps: {
		kind: "redline" | "comment" | "resolve";
		summary: string;
		paragraphIndex?: number;
	}[];
	/** mtime of the draft file (ms), null when it doesn't exist. */
	lastSavedMs: number | null;
	/** Non-Patrick comments in the draft that mention @Patrick. */
	mentions: DraftComment[];
	/** Parked edits that later failed to apply (e.g. the paragraph changed). */
	failures: string[];
};
