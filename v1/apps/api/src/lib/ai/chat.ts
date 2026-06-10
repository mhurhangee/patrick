import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAiSdkTools } from "@eigenpal/docx-editor-agents/ai-sdk/server";
import {
	convertToModelMessages,
	type ModelMessage,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai";
import type { Context } from "hono";
import { readProfile } from "../profiles";
import { readTask } from "../tasks";
import { createModel, reasoningOptions } from "./model";
import { buildSystemPrompt, type OpenDocInput } from "./prompt";

// The drafting subset AgentPat gets: locate + mutate, plus re-reads (the open
// doc's text is already pushed into the prompt, but the editor moves as the
// agent edits, so read_document lets it refresh). The rest (formatting, comment
// threads, navigation) we add as we need them.
const TOOL_ALLOW = new Set([
	"read_document",
	"read_selection",
	"find_text",
	"read_changes",
	"read_comments",
	"add_comment",
	"suggest_change",
]);

type FilePart = { type: "file"; data: Uint8Array; mediaType: string };

// Open PDFs ride as file parts on the latest user message (OPEN = CONTEXT:
// opening a PDF means the agent gets the real bytes). docx text is pushed into
// the system prompt instead — see buildSystemPrompt.
async function buildPdfParts(
	folder: string,
	openDocs: OpenDocInput[],
): Promise<FilePart[]> {
	const parts: FilePart[] = [];
	for (const doc of openDocs) {
		if (doc.kind !== "pdf") continue;
		try {
			const data = await readFile(join(folder, doc.filename));
			parts.push({
				type: "file",
				data: new Uint8Array(data),
				mediaType: "application/pdf",
			});
		} catch {
			// Not readable — skip it rather than fail the whole turn.
		}
	}
	return parts;
}

// Attach the PDFs to the LATEST user message (not a synthetic preamble). Anchored
// to the current turn so history stays stable when a doc is later closed.
function attachToLastUser(messages: ModelMessage[], parts: FilePart[]): void {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m?.role !== "user") continue;
		const existing =
			typeof m.content === "string"
				? [{ type: "text" as const, text: m.content }]
				: m.content;
		messages[i] = {
			...m,
			content: [...existing, ...parts],
		} as ModelMessage;
		return;
	}
}

export async function handleChat(c: Context) {
	const id = c.req.param("id");
	if (!id) return c.json({ error: "missing task id" }, 400);
	const body = await c.req.json<{
		messages: UIMessage[];
		profileId: string;
		openDocs?: OpenDocInput[];
	}>();

	const task = await readTask(id);
	if (!task) return c.json({ error: "task not found" }, 404);
	const profile = await readProfile(body.profileId);
	if (!profile) return c.json({ error: "profile not found" }, 404);

	const openDocs = body.openDocs ?? [];
	const { provider, apiKey, detailedModel, effort, showThinking } = profile.ai;
	const model = createModel(provider, apiKey, detailedModel);
	const { providerOptions } = reasoningOptions(
		provider,
		detailedModel,
		effort,
		showThinking,
	);
	const system = await buildSystemPrompt(profile, task, openDocs);

	// Editor tools with no execute — the AI SDK forwards each call to the client's
	// onToolCall, where it runs against the live editor (native tracked changes).
	const tools = Object.fromEntries(
		Object.entries(getAiSdkTools()).filter(([name]) => TOOL_ALLOW.has(name)),
	);

	const messages = await convertToModelMessages(body.messages);
	const fileParts = await buildPdfParts(task.folder, openDocs);
	if (fileParts.length) attachToLastUser(messages, fileParts);

	const result = streamText({
		model,
		system,
		messages,
		tools,
		stopWhen: stepCountIs(20),
		providerOptions,
	});

	return result.toUIMessageStreamResponse({
		sendReasoning: true,
		messageMetadata: ({ part }) =>
			part.type === "finish" && "totalUsage" in part
				? { usage: part.totalUsage }
				: undefined,
	});
}
