import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getAiSdkTools } from "@eigenpal/docx-editor-agents/ai-sdk/server";
import { DocxReviewer } from "@eigenpal/docx-editor-agents/server";
import { fileCachedFetcher, lookupProvisions } from "@patrick/law";
import {
	type ExchangeMetadata,
	modelsForProvider,
	PATRICK_DOCS,
	type PinnedSource,
	type Profile,
	type Provider,
	toStoredMessage,
} from "@patrick/shared";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	isStepCount,
	type ModelMessage,
	streamText,
	tool,
	toUIMessageStream,
	type UIMessage,
} from "ai";
import type { Context } from "hono";
import { z } from "zod";
import { readChat, saveChat } from "../chats";
import { lawCacheDir } from "../config";
import {
	listDocuments,
	readDocumentMeta,
	readExtractedText,
} from "../documents";
import { readProfile } from "../profiles";
import { readTask } from "../tasks";
import { buildChartTools, chartManifest } from "./chart-tools";
import { createFindLaw } from "./find-law";
import { createModel, reasoningOptions, vendorOf } from "./model";
import { type AvailableDoc, buildSystemPrompt } from "./prompt";
import { webSearchTool } from "./web-search";

// The model a turn runs on: the chat's locked model when it's valid for the
// profile's current provider, else the profile default. Guards the case where the
// profile switched providers after the chat locked — a foreign model id paired
// with the new provider would fail every turn (and bricks a model-locked chat).
function resolveModel(profile: Profile, requested?: string): string {
	if (
		requested &&
		modelsForProvider(profile.ai.provider).some((m) => m.id === requested)
	)
		return requested;
	return profile.ai.model;
}

// A chat freezes its instructions at first send: the profile's prompt is resolved
// then, persisted on the chat, and reused for every later turn — so editing the
// profile (or swapping it) never rewrites an in-flight conversation. Read-only;
// there is no per-chat editing. Before the first send (no persisted chat yet) it
// follows the live profile.
async function frozenTemplate(
	folder: string,
	chatId: string | undefined,
	profile: Profile,
): Promise<string> {
	const existing = chatId ? await readChat(folder, chatId) : null;
	return existing?.systemTemplate ?? profile.prompts.agentpat;
}

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
	/** The chart tab the attorney is viewing (so "this chart" resolves); read via read_chart. */
	openChart?: string | null;
	/** The model for this turn (locked per chat client-side); absent ⇒ profile default. */
	model?: string;
	/** Whether web search is available this turn (toolbar toggle). Default on. */
	webSearch?: boolean;
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

// No-execute, but client-run (not HITL): the search runs in the webview against the
// document's local index and returns passages directly — no accept/reject card.
const searchDocument = tool({
	description:
		"Search ONE source document's full text and get back its most relevant passages (with page numbers) — instead of reading the whole document. Use this to find where a document discloses a feature, or to pull supporting evidence, without pinning the entire thing into context; ideal for long prior art. Pass an exact filename (from the pinned or available lists). Give your actual question/need in `query`, and put synonyms and alternate phrasings of that SAME need in `expansions` — one call casts the wide net, so you don't need to fire several reworded searches. If it reports no extractable text, the PDF needs to be extracted/OCR'd first.",
	inputSchema: z.object({
		filename: z.string().describe("Exact filename of the document to search"),
		query: z
			.string()
			.describe(
				"Your actual information need in natural language — the question or feature you're looking for. Results are ranked against THIS.",
			),
		expansions: z
			.array(z.string())
			.optional()
			.describe(
				"Synonyms, alternate phrasings, or related terms for the SAME need (e.g. for 'emergency or police vehicles': ['siren', 'ambulance', 'fire truck', 'police car']). They widen the candidate net in this one call — provide them up front instead of repeating the search with reworded queries.",
			),
	}),
});

const suggestLabel = tool({
	description:
		"Propose a short one-line label for a document — what it is, in a few words — plus a couple of follow-up prompts the attorney might next ask about THAT document. The attorney accepts to apply the label; the prompts become one-tap chips in the chat. Helpful for documents that have no label yet.",
	inputSchema: z.object({
		filename: z.string().describe("Exact filename of the document to label"),
		label: z
			.string()
			.describe(
				"A concise label, e.g. 'specification as filed' or 'Smith reference (US7557198)'",
			),
		suggestions: z
			.array(z.string())
			.min(2)
			.max(3)
			.optional()
			.describe(
				"2-3 short, specific things the attorney might next ask Patrick about THIS document, phrased as prompts to Patrick, e.g. 'Summarise the independent claims' or 'Compare this with my draft'. Tailored to the document's content and kind.",
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

const suggestBrief = tool({
	description:
		"Propose an edit to the task brief — the living statement of what this matter is, the objective, and the running record, injected into every chat. Markdown (headings, lists, **bold**).\n\nSet `append: true` to add a short insight (a decision, a finding worth remembering) to the end of the brief without disturbing the rest — prefer this for incremental notes. Omit `append` to propose the whole brief (e.g. drafting it from the documents — pin any you need first via requestOpenFile); then preserve anything worth keeping. The attorney accepts to apply it.",
	inputSchema: z.object({
		brief: z
			.string()
			.describe(
				"With append: the note to add. Without: the whole brief as markdown.",
			),
		append: z
			.boolean()
			.optional()
			.describe("Append the text as a note instead of replacing the brief."),
	}),
});

const fetchPublication = tool({
	description:
		"Propose fetching the full text (claims + description) of a published patent by publication number — EP, WO, US, and other English-language offices (GB, AU, CA…). The attorney confirms; it's saved into the matter folder and pinned, ready to read. EP/WO come from EPO Open Patent Services when the attorney has a key, otherwise (and for everything else) from Google Patents. Non-English publications (JP, KR, CN, DE…) aren't supported yet. Useful for any published document — a cited reference or X/Y document in a search report, or a clean text version of a publication the attorney is prosecuting. A country prefix is required (EP…, US…).",
	inputSchema: z.object({
		number: z
			.string()
			.describe(
				"The publication number, e.g. 'EP3707572' or 'EP3707572B1' (a kind code is optional).",
			),
	}),
});

const suggestPrompt = tool({
	description:
		"Propose a change to the attorney's prompt — the instructions that steer you across all of their tasks, written as `## Header` markdown sections (e.g. practice context, do's, don'ts, response style). Your capabilities and the current task/documents are added automatically, so never include them.\n\nUsually pass `heading` to add or rewrite a SINGLE section, leaving everything else they've written untouched — prefer this. Omit `heading` only to rewrite the whole prompt, and then preserve every section they already have. The attorney accepts to apply it; it takes effect in new chats.",
	inputSchema: z.object({
		heading: z
			.string()
			.min(1)
			.optional()
			.describe(
				"The section to add or replace, e.g. 'Practice context'. Omit only to replace the entire prompt.",
			),
		content: z
			.string()
			.describe(
				"With a heading: that section's body text. Without: the whole prompt as ## Header sections.",
			),
	}),
});

// Server-executed (unlike the no-execute editor/HITL tools): returns the bundled
// Patrick docs so the agent can answer how-to questions about the app itself.
const patrickHelp = tool({
	description:
		"Look up how Patrick works — its features, setup, and how to use the app. Call this for a how-to or 'how does Patrick…' question about the app itself, not about the attorney's matter.",
	inputSchema: z.object({}),
	execute: async () => PATRICK_DOCS,
});

// Verbatim EPC law recall. Server-executed: resolves each ref against the bundled
// provision map, fetches the page on demand (cached in the config home, so it's
// offline after first use), and returns the current text. The agent must quote
// only from this output — it's the guard against hallucinated legal text.
const lawFetcher = fileCachedFetcher(lawCacheDir());

const epcLookup = tool({
	description:
		"Look up European patent law and get its VERBATIM current text from epo.org: EPC Articles, Rules, and Rules relating to Fees; EPO Guidelines for Examination (EPC and PCT-EPO); and Case Law of the Boards of Appeal (the 'white book' sections). Call this WHENEVER a specific provision/section is cited (by an examiner, by the attorney, or one you are about to rely on), and quote the law ONLY from what this returns — never recite from memory, as getting it slightly wrong is unacceptable. Pass canonical keys: EPC 'A54' / 'A123(2)' / 'R137(3)' / 'RFees A2'; Guidelines 'G-VII 5.3' (EPC) or 'PCT G-VII 5' (PCT-EPO); case law 'II.E.1.3.1'. If you don't have the exact citation, discover it with find_law first. A paragraph in parentheses is noted as the focus. Each result carries the title, the in-force version/date, and (for EPC provisions) footnotes; unresolved refs come back as not_found.",
	inputSchema: z.object({
		refs: z
			.array(z.string())
			.min(1)
			.describe(
				"Citation keys or concepts, e.g. ['A54(2)', 'R137', 'inventive step'].",
			),
	}),
	execute: async ({ refs }) => ({
		results: await lookupProvisions(refs, lawFetcher),
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
export async function pinnedSourcesMessage(
	folder: string,
	pinned: PinnedSource[],
): Promise<ModelMessage | null> {
	if (pinned.length === 0) return null;
	const meta = await readDocumentMeta(folder);
	// Read every source in parallel (each yields its content parts in order).
	const perSource = await Promise.all(
		pinned.map(async (src): Promise<Part[]> => {
			if (src.kind === "pdf") {
				// Context mode: send the extracted text (cheap) instead of the image
				// when the attorney chose it and text exists; otherwise the PDF itself.
				if (meta[src.filename]?.contextMode === "text") {
					const ext = await readExtractedText(folder, src.filename);
					const body = ext
						? ext.pages
								.map((p) => p.text.trim())
								.filter(Boolean)
								.join("\n\n")
						: "";
					// Only use text mode when there's actual text; otherwise fall
					// through to the PDF image (don't pin an empty source).
					if (ext && body) {
						const note =
							ext.source === "ocr"
								? " (extracted text — OCR, verify against the original)"
								: " (extracted text)";
						console.log(
							`[context] ${src.filename} → extracted text (${ext.source}), ${body.length} chars`,
						);
						return [
							{ type: "text", text: `\n# ${src.filename}${note}\n${body}` },
						];
					}
				}
				try {
					const data = await readFile(join(folder, src.filename));
					console.log(
						`[context] ${src.filename} → PDF image, ${data.length} bytes`,
					);
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
			if (src.kind === "text") {
				// Plain-text sources (retrieved prior art) are already text — inject
				// directly, no docx extraction.
				try {
					const raw = (
						await readFile(join(folder, src.filename), "utf8")
					).trim();
					console.log(
						`[context] ${src.filename} → text source, ${raw.length} chars`,
					);
					return [
						{
							type: "text",
							text: `\n# ${src.filename}\n${raw || "(empty)"}`,
						},
					];
				} catch {
					return [];
				}
			}
			const text = await docxText(folder, src.filename);
			console.log(
				`[context] ${src.filename} → docx text, ${text.length} chars`,
			);
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

/** Like pinnedSourcesMessage but the PRIMARY source MUST load — returns null if it didn't,
 *  so an unreadable reference with a readable secondary (primer / description) can't slip
 *  through and have the model analyse the wrong document. The secondary stays best-effort
 *  (omitted if it fails). */
export async function pinnedWithRequiredPrimary(
	folder: string,
	primary: PinnedSource,
	secondary?: PinnedSource,
): Promise<ModelMessage | null> {
	const main = await pinnedSourcesMessage(folder, [primary]);
	// Header-only ⇒ the primary couldn't be read (missing / un-extracted PDF / empty).
	if (!main || !Array.isArray(main.content) || main.content.length <= 1)
		return null;
	if (!secondary) return main;
	const extra = await pinnedSourcesMessage(folder, [secondary]);
	if (!extra || !Array.isArray(extra.content) || extra.content.length <= 1)
		return main; // secondary unreadable — proceed with the primary alone.
	// Drop the secondary message's duplicate "Pinned sources" header (its first part).
	return {
		role: "user",
		content: [...main.content, ...extra.content.slice(1)],
	} as ModelMessage;
}

// The tools Patrick gets for a turn: editor tools (no execute — they run against
// the live editor client-side) + the law/search/HITL tools. Web search and the
// open-a-file proposal are conditional. Built in one place so the inspection
// panel can list the exact active tool names without drifting from what ships.
function buildChatTools(opts: {
	folder: string;
	profile: Profile;
	provider: Provider;
	apiKey: string;
	modelId: string;
	webSearch: boolean;
	hasDocs: boolean;
}) {
	return {
		...Object.fromEntries(
			Object.entries(getAiSdkTools()).filter(([name]) => TOOL_ALLOW.has(name)),
		),
		suggestLabel,
		suggestBrief,
		suggestPrompt,
		createDraft,
		requestUnlock,
		fetchPublication,
		patrick_help: patrickHelp,
		ep_law_lookup: epcLookup,
		// Chart-driving tools: server-executed, they read/write the Chart JSON and run the
		// parse/read engines — Patrick builds claim charts whether or not the tab is open.
		...buildChartTools(opts.folder, opts.profile),
		find_law: createFindLaw({
			provider: opts.provider,
			apiKey: opts.apiKey,
			modelId: opts.modelId,
		}),
		// Web search runs on the attorney's own model (provider-executed) unless the
		// toolbar toggle is off. Caveat (accepted): a provider/org that doesn't
		// support it (notably Anthropic when it isn't enabled in the org console)
		// errors the whole turn — the toggle is the escape hatch.
		...(opts.webSearch
			? webSearchTool(vendorOf(opts.provider, opts.modelId))
			: {}),
		...(opts.hasDocs
			? { requestOpenFile, search_document: searchDocument }
			: {}),
	};
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
	const { provider, apiKey, effort } = profile.ai;
	// The chat locks its model at first send (client sends it each turn); falls back
	// to the profile default for the first request, older chats, or a model that no
	// longer fits the provider.
	const modelId = resolveModel(profile, body.model ?? undefined);
	const model = createModel(provider, apiKey, modelId);
	const { providerOptions } = reasoningOptions(provider, modelId, effort);
	const template = await frozenTemplate(task.folder, body.chatId, profile);
	const charts = await chartManifest(task.folder, body.openChart);
	const system = buildSystemPrompt(
		task,
		pinnedSources,
		activeDraft,
		available,
		charts,
		template,
	);

	// Adding/removing a capability? Do it in buildChatTools — and update
	// PATRICK_CAPABILITIES in @patrick/shared so the prompt describes Patrick honestly.
	const tools = buildChatTools({
		folder: task.folder,
		profile,
		provider,
		apiKey,
		modelId,
		webSearch: body.webSearch !== false,
		hasDocs: available.length > 0,
	});

	// When web search is toggled off, strip any web_search tool parts left in the
	// history by earlier turns — sending those tool calls without the tool declared
	// makes some providers (Anthropic) reject the whole turn with a 400.
	const history =
		body.webSearch === false
			? body.messages.map((m) => ({
					...m,
					parts: m.parts.filter(
						(p) =>
							p.type !== "tool-web_search" && p.type !== "tool-google_search",
					),
				}))
			: body.messages;

	// Pinned read-only sources lead the conversation as one cached block.
	const conversation = await convertToModelMessages(history);
	const pinnedMsg = await pinnedSourcesMessage(task.folder, pinnedSources);
	const messages = pinnedMsg ? [pinnedMsg, ...conversation] : conversation;

	const result = streamText({
		model,
		instructions: system,
		messages,
		tools,
		stopWhen: isStepCount(20),
		providerOptions,
	});

	const uiStream = toUIMessageStream({
		stream: result.stream,
		sendReasoning: true,
		// Web-search results stream as source-url parts → the answer's citations block.
		sendSources: true,
		// Observability: context is known up front, so send it at "start" (the UI
		// can show what was sent while it streams). Usage lands at "finish".
		messageMetadata: ({ part }): ExchangeMetadata | undefined => {
			if (part.type === "start")
				return {
					context: { model: modelId, pinnedSources, activeDraft },
				};
			if (part.type === "finish" && "totalUsage" in part)
				return { usage: part.totalUsage };
			return undefined;
		},
		// Persist on every finish (one fires per tool round-trip). onFinish's
		// `messages` is only the response side — the user message + prior history
		// live in body.messages (the client re-sends the full conversation each
		// request). Merge them by id so the saved chat is the whole conversation.
		onEnd: async ({ responseMessage }) => {
			if (!body.chatId) return;
			const byId = new Map<string, UIMessage>();
			for (const m of body.messages) byId.set(m.id, m);
			byId.set(responseMessage.id, responseMessage);
			await saveChat(task.folder, {
				id: body.chatId,
				systemTemplate: template,
				model: modelId,
				pinnedSources,
				messages: [...byId.values()].map((m) =>
					toStoredMessage({ ...m, parts: m.parts as unknown[] }),
				),
			});
		},
	});

	return createUIMessageStreamResponse({ stream: uiStream });
}
