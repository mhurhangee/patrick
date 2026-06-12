import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getAiSdkTools } from "@eigenpal/docx-editor-agents/ai-sdk/server";
import { DocxReviewer } from "@eigenpal/docx-editor-agents/server";
import {
	type ExchangeMetadata,
	type PinnedSource,
	PROMPT_TOKENS,
	toStoredMessage,
} from "@patrick/shared";
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

// HITL: no-execute tools. The model calls them to propose an action; the call
// streams to the client, which shows an accept/reject card and resolves it.
const requestOpenFile = tool({
	description:
		"Propose adding one of the available (not-yet-in-context) source documents to context. The attorney must accept before you can read it. Use when you need a document that isn't in context.",
	inputSchema: z.object({
		filename: z
			.string()
			.describe("Exact filename from the 'not yet in context' list"),
	}),
});

const suggestLabel = tool({
	description:
		"Propose a short one-line label for a document — what it is, in a few words. The attorney accepts to apply it. Helpful for documents that have no label yet.",
	inputSchema: z.object({
		filename: z.string().describe("Exact filename of the document to label"),
		label: z
			.string()
			.describe(
				"A concise label, e.g. 'specification as filed' or 'Smith reference (US7557198)'",
			),
	}),
});

const createDraft = tool({
	description:
		"Propose creating a new blank Word document to draft in (e.g. an office-action response). The attorney accepts; it opens as the active draft you then edit with the document tools.",
	inputSchema: z.object({
		name: z
			.string()
			.describe(
				"A name for the draft, e.g. 'Response to Non-Final Office Action'",
			),
	}),
});

const requestUnlock = tool({
	description:
		"Propose making an editable copy of an original .docx document (the attorney's originals are read-only) so you can draft amendments in it. The attorney accepts; the copy opens as the active draft. Only works on .docx files — PDFs and other formats can't be edited, so don't propose it for them; instead explain that, or use createDraft to start a fresh document.",
	inputSchema: z.object({
		filename: z
			.string()
			.describe(
				"Exact filename of the original .docx document to copy for editing",
			),
	}),
});

const saveNote = tool({
	description:
		"Propose saving a durable insight to the task's running notes (strategy, a decision, a fact worth remembering across chats). The attorney accepts to add it.",
	inputSchema: z.object({
		note: z.string().describe("The note to save — one concise insight"),
	}),
});

const suggestBrief = tool({
	description:
		"Propose the task brief — a short, one-paragraph statement of what this matter is and the objective, which frames everything you do. Draft it from the matter's documents (pin any you need first via requestOpenFile). The attorney accepts to apply it.",
	inputSchema: z.object({
		brief: z.string().describe("The proposed brief — one concise paragraph"),
	}),
});

const suggestPracticeContext = tool({
	description:
		"Propose a value for the attorney's profile practice context — who they are and how they practise, which steers your work across all of their tasks. Ask about their practice first if you need to. The attorney accepts to apply it.",
	inputSchema: z.object({
		practiceContext: z
			.string()
			.describe("The proposed practice context for the profile"),
	}),
});

// The placeholder tokens a prompt template may use, listed for suggestPrompt so
// Patrick keeps them in place when rewriting the template.
const TOKEN_HELP = PROMPT_TOKENS.map(
	(t) => `<${t.name}> (${t.description})`,
).join(", ");

const suggestPrompt = tool({
	description: `Propose an improved version of the attorney's Patrick prompt — the template that instructs you across all of their tasks. Preserve the placeholder tokens, which are filled in automatically: ${TOKEN_HELP}. The attorney accepts to apply it; it takes effect in new chats.`,
	inputSchema: z.object({
		prompt: z
			.string()
			.describe("The full proposed prompt template, including the tokens"),
	}),
});

// Read-only docx → indexed plain text, headless from disk. The headless parse is
// the pricey bit and originals don't change, so memoise by path+mtime — a
// multi-turn chat then extracts each pinned docx once, not every turn.
const docxTextCache = new Map<string, { mtimeMs: number; text: string }>();

async function docxText(folder: string, filename: string): Promise<string> {
	const path = join(folder, filename);
	try {
		const mtimeMs = (await stat(path)).mtimeMs;
		const cached = docxTextCache.get(path);
		if (cached && cached.mtimeMs === mtimeMs) return cached.text;
		const buf = await readFile(path);
		const bytes = buf.buffer.slice(
			buf.byteOffset,
			buf.byteOffset + buf.byteLength,
		) as ArrayBuffer;
		const reviewer = await DocxReviewer.fromBuffer(bytes, "Patrick");
		const text = reviewer.getContentAsText().trim();
		docxTextCache.set(path, { mtimeMs, text });
		return text;
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
// OpenAI auto-caches the prefix; others ignore it.)
async function pinnedSourcesMessage(
	folder: string,
	pinned: PinnedSource[],
): Promise<ModelMessage | null> {
	if (pinned.length === 0) return null;
	// Read every source in parallel (each yields its content parts in order).
	const perSource = await Promise.all(
		pinned.map(async (src): Promise<Part[]> => {
			if (src.kind === "pdf") {
				try {
					const data = await readFile(join(folder, src.filename));
					return [
						{ type: "text", text: `\n# ${src.filename}` },
						{
							type: "file",
							data: new Uint8Array(data),
							mediaType: "application/pdf",
						},
					];
				} catch {
					return []; // unreadable — skip rather than fail the turn
				}
			}
			const text = await docxText(folder, src.filename);
			return [
				{ type: "text", text: `\n# ${src.filename}\n${text || "(empty)"}` },
			];
		}),
	);
	const content: Part[] = [
		{
			type: "text",
			text: "Pinned sources for this matter (read-only references):",
		},
		...perSource.flat(),
	];
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
		suggestLabel,
		suggestBrief,
		suggestPracticeContext,
		suggestPrompt,
		createDraft,
		requestUnlock,
		saveNote,
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
				messages: [...byId.values()].map((m) =>
					toStoredMessage({ ...m, parts: m.parts as unknown[] }),
				),
			});
		},
	});
}
