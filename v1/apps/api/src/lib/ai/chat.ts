import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAiSdkTools } from "@eigenpal/docx-editor-agents/ai-sdk/server";
import { DocxReviewer } from "@eigenpal/docx-editor-agents/server";
import type { ExchangeMetadata, PinnedSource } from "@patrick/shared";
import {
	convertToModelMessages,
	type ModelMessage,
	stepCountIs,
	streamText,
	tool,
	type UIMessage,
} from "ai";
import type { Context } from "hono";
import { z } from "zod";
import { saveChat } from "../chats";
import { listDocuments } from "../documents";
import { readProfile } from "../profiles";
import { readTask } from "../tasks";
import { createModel, reasoningOptions } from "./model";
import { type AvailableDoc, buildSystemPrompt } from "./prompt";

// The drafting subset Patrick gets: locate + mutate, plus reads (the active
// draft isn't in the static prompt — the agent reads it live, always current).
const TOOL_ALLOW = new Set([
	"read_document",
	"read_selection",
	"find_text",
	"read_changes",
	"read_comments",
	"add_comment",
	"suggest_change",
]);

type RequestBody = {
	messages: UIMessage[];
	profileId: string;
	/** The chat being written to (persisted under .patrick/chats on each turn). */
	chatId?: string;
	/** Read-only sources pinned into context (append-only for the chat's life). */
	pinnedSources?: PinnedSource[];
	/** The editable draft in focus — driven by the editor tools, not pinned. */
	activeDraft?: string | null;
	/** Per-chat instructions edit (ephemeral); absent ⇒ the profile's template. */
	templateOverride?: string | null;
};

// Folder awareness: the read-only sources in the task folder that AREN'T in
// context yet — by filename + label, never content. Editable drafts (workspace)
// and excluded docs are left out; Patrick can propose pinning one via the HITL
// requestOpenFile tool.
async function availableDocs(
	folder: string,
	pinned: PinnedSource[],
	activeDraft: string | null,
): Promise<AvailableDoc[]> {
	const docs = await listDocuments(folder);
	const pinnedNames = new Set(pinned.map((p) => p.filename));
	return docs
		.filter((d) => {
			const editable =
				d.filename.toLowerCase().endsWith(".docx") && !!d.createdInPatrick;
			return (
				!editable &&
				!d.excluded &&
				!pinnedNames.has(d.filename) &&
				d.filename !== activeDraft
			);
		})
		.map((d) => ({ filename: d.filename, label: d.label }));
}

// HITL: a no-execute tool. The model calls it to propose pinning a source; the
// call streams to the client, which shows an accept/reject card and resolves it.
const requestOpenFile = tool({
	description:
		"Propose adding one of the available (not-yet-in-context) source documents to context. The attorney must accept before you can read it. Use when you need a document that isn't in context.",
	inputSchema: z.object({
		filename: z
			.string()
			.describe("Exact filename from the 'not yet in context' list"),
	}),
});

// Read-only docx → indexed plain text, headless from disk. Originals never
// change, so once pinned this content is stable (and therefore cacheable).
async function docxText(folder: string, filename: string): Promise<string> {
	try {
		const buf = await readFile(join(folder, filename));
		const bytes = buf.buffer.slice(
			buf.byteOffset,
			buf.byteOffset + buf.byteLength,
		) as ArrayBuffer;
		const reviewer = await DocxReviewer.fromBuffer(bytes, "Patrick");
		return reviewer.getContentAsText().trim();
	} catch {
		return "";
	}
}

type TextPart = {
	type: "text";
	text: string;
	providerOptions?: Record<string, unknown>;
};
type FilePart = {
	type: "file";
	data: Uint8Array;
	mediaType: string;
	providerOptions?: Record<string, unknown>;
};
type Part = TextPart | FilePart;

// Pinned sources ride as ONE leading user message, append-only across the chat:
// PDFs as file parts, read-only docx as text. A cache breakpoint on the last part
// means [system + this whole block] caches — the big, stable source tokens are
// paid once, then cached every later turn. (Anthropic honours cacheControl;
// OpenAI auto-caches the prefix; others ignore it.) See v1-context-model.
async function pinnedSourcesMessage(
	folder: string,
	pinned: PinnedSource[],
): Promise<ModelMessage | null> {
	if (pinned.length === 0) return null;
	const content: Part[] = [
		{
			type: "text",
			text: "Pinned sources for this matter (read-only references):",
		},
	];
	for (const src of pinned) {
		if (src.kind === "pdf") {
			try {
				const data = await readFile(join(folder, src.filename));
				content.push({ type: "text", text: `\n# ${src.filename}` });
				content.push({
					type: "file",
					data: new Uint8Array(data),
					mediaType: "application/pdf",
				});
			} catch {
				// Unreadable — skip rather than fail the turn.
			}
		} else {
			const text = await docxText(folder, src.filename);
			content.push({
				type: "text",
				text: `\n# ${src.filename}\n${text || "(empty)"}`,
			});
		}
	}
	// Cache breakpoint on the final block: everything up to here is the cache prefix.
	const last = content[content.length - 1];
	if (last)
		last.providerOptions = {
			anthropic: { cacheControl: { type: "ephemeral" } },
		};
	return { role: "user", content } as ModelMessage;
}

// Zero-cost observability: assemble and return the exact system prompt + context
// a turn would send, without calling the model. Drives the context inspector.
export async function handleChatPreview(c: Context) {
	const id = c.req.param("id");
	if (!id) return c.json({ error: "missing task id" }, 400);
	const body = await c.req.json<RequestBody>();

	const task = await readTask(id);
	if (!task) return c.json({ error: "task not found" }, 404);
	const profile = await readProfile(body.profileId);
	if (!profile) return c.json({ error: "profile not found" }, 404);

	const pinnedSources = body.pinnedSources ?? [];
	const activeDraft = body.activeDraft ?? null;
	const available = await availableDocs(
		task.folder,
		pinnedSources,
		activeDraft,
	);
	const system = buildSystemPrompt(
		profile,
		task,
		pinnedSources,
		activeDraft,
		available,
		body.templateOverride,
	);
	return c.json({
		model: profile.ai.detailedModel,
		system,
		pinnedSources,
		activeDraft,
	});
}

export async function handleChat(c: Context) {
	const id = c.req.param("id");
	if (!id) return c.json({ error: "missing task id" }, 400);
	const body = await c.req.json<RequestBody>();

	const task = await readTask(id);
	if (!task) return c.json({ error: "task not found" }, 404);
	const profile = await readProfile(body.profileId);
	if (!profile) return c.json({ error: "profile not found" }, 404);

	const pinnedSources = body.pinnedSources ?? [];
	const activeDraft = body.activeDraft ?? null;
	const available = await availableDocs(
		task.folder,
		pinnedSources,
		activeDraft,
	);
	const { provider, apiKey, detailedModel, effort } = profile.ai;
	const model = createModel(provider, apiKey, detailedModel);
	const { providerOptions } = reasoningOptions(provider, detailedModel, effort);
	const system = buildSystemPrompt(
		profile,
		task,
		pinnedSources,
		activeDraft,
		available,
		body.templateOverride,
	);

	// Editor tools (no execute — run client-side against the live editor) + our
	// HITL requestOpenFile when there are docs to propose (resolved by a card).
	const tools = {
		...Object.fromEntries(
			Object.entries(getAiSdkTools()).filter(([name]) => TOOL_ALLOW.has(name)),
		),
		...(available.length > 0 ? { requestOpenFile } : {}),
	};

	// Pinned read-only sources lead the conversation as one cached block.
	const conversation = await convertToModelMessages(body.messages);
	const pinnedMsg = await pinnedSourcesMessage(task.folder, pinnedSources);
	const messages = pinnedMsg ? [pinnedMsg, ...conversation] : conversation;

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
		// Observability: context is known up front, so send it at "start" (the UI
		// can show what was sent while it streams). Usage lands at "finish".
		messageMetadata: ({ part }): ExchangeMetadata | undefined => {
			if (part.type === "start")
				return {
					context: { model: detailedModel, pinnedSources, activeDraft },
				};
			if (part.type === "finish" && "totalUsage" in part)
				return { usage: part.totalUsage };
			return undefined;
		},
		// Persist on every finish (one fires per tool round-trip). onFinish's
		// `messages` is only the response side — the user message + prior history
		// live in body.messages (the client re-sends the full conversation each
		// request). Merge them by id so the saved chat is the whole conversation.
		onFinish: async ({ responseMessage }) => {
			if (!body.chatId) return;
			const byId = new Map<string, UIMessage>();
			for (const m of body.messages) byId.set(m.id, m);
			byId.set(responseMessage.id, responseMessage);
			await saveChat(task.folder, {
				id: body.chatId,
				systemTemplate: body.templateOverride ?? profile.prompts.agentpat,
				pinnedSources,
				messages: [...byId.values()].map((m) => ({
					id: m.id,
					role: m.role === "assistant" ? "assistant" : "user",
					parts: m.parts as unknown[],
					metadata: m.metadata,
					createdAt: new Date().toISOString(),
				})),
			});
		},
	});
}
