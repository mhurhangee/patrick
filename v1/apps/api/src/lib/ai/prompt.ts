import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DocxReviewer } from "@eigenpal/docx-editor-agents/server";
import { type Profile, type Task, TOKEN_RE } from "@patrick/shared";

/** One open document — what the attorney has in a tab. Text is read from disk
 *  server-side (headless), so background tabs and live editors are all covered. */
export type OpenDocInput = {
	filename: string;
	kind: "pdf" | "docx";
};

// Extract a .docx as indexed plain text, headless from its bytes on disk. The
// `[0] …\n[1] …` format is exactly the coordinate system find_text /
// suggest_change locate by — the context we feed and the edits speak one
// language. Disk lags live edits by the autosave debounce; the agent re-reads
// live via read_document when it needs precision.
async function docxText(folder: string, filename: string): Promise<string> {
	try {
		const buf = await readFile(join(folder, filename));
		const bytes = buf.buffer.slice(
			buf.byteOffset,
			buf.byteOffset + buf.byteLength,
		) as ArrayBuffer;
		const reviewer = await DocxReviewer.fromBuffer(bytes, "AgentPat");
		return reviewer.getContentAsText().trim();
	} catch {
		return "";
	}
}

// OPEN = CONTEXT: every open document goes into the prompt in full. docx as
// indexed text; PDFs are noted here and ride as file parts (see chat.ts).
async function renderOpenDocs(
	folder: string,
	openDocs: OpenDocInput[],
): Promise<string> {
	if (openDocs.length === 0)
		return "No documents are open. Ask the attorney to open one.";
	const blocks = await Promise.all(
		openDocs.map(async (doc) => {
			if (doc.kind === "pdf")
				return `## ${doc.filename}\n_Full document attached above as a file part._`;
			const text = await docxText(folder, doc.filename);
			return `## ${doc.filename} (editable draft)\n${text || "_(empty document)_"}`;
		}),
	);
	return blocks.join("\n\n");
}

// Fill the profile's AgentPat template. The full token/resolver engine (closed
// docs, writing examples, task type) lands next; for the spine this covers the
// tokens the spine needs and drops the rest.
export async function buildSystemPrompt(
	profile: Profile,
	task: Task,
	openDocs: OpenDocInput[],
): Promise<string> {
	const fills: Record<string, string> = {
		PRACTICECONTEXT: profile.identity.practiceContext?.trim() ?? "",
		TASK: task.label?.trim() || "(untitled task)",
		OPENDOCUMENTS: await renderOpenDocs(task.folder, openDocs),
		CLOSEDDOCUMENTS: "",
		EXAMPLES: "",
	};
	const filled = profile.prompts.agentpat.replace(
		TOKEN_RE,
		(match, name: string) => fills[name] ?? match,
	);
	// Collapse the blank lines empty tokens leave behind.
	return filled.replace(/\n{3,}/g, "\n\n").trim();
}
