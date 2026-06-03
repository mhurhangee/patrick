import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import {
	type Chat,
	type ChatIndexEntry,
	type ChatMessage,
	CONTEXT_OVERFLOW_MARKER,
} from "@patrickos/shared"
import type { ModelMessage } from "ai"
import { createAgentUIStreamResponse, ToolLoopAgent, tool } from "ai"
import { Hono } from "hono"
import { z } from "zod"
import { fetchPatent } from "../lib/epo-ops"
import {
	listAnalysis,
	readChat,
	readChatIndex,
	readSettings,
	readTasks,
	writeChat,
	writeChatIndex,
} from "../lib/fs"
import {
	buildAgentPatPrompt,
	createModel,
	reasoningOptions,
} from "../lib/patent-prompt"

// Does a provider error look like a context-window overflow? Each vendor phrases
// it differently, so match the common shapes (and fall back to generic otherwise).
function isContextOverflow(message: string): boolean {
	return /context (length|window)|maximum context|too many tokens|prompt is too long|input (is )?too large|exceeds?.{0,30}(context|token|maximum)|reduce the length/i.test(
		message,
	)
}

// No execute — loop stops when called; data lives in part.input on the client.
const generateMetadata = tool({
	description:
		"Generate metadata after your response. Call this ONCE as your final action.",
	inputSchema: z.object({
		suggestions: z
			.array(z.string())
			.length(3)
			.describe(
				"Three short follow-up actions or questions (under 8 words each)",
			),
		chatTitle: z
			.string()
			.max(60)
			.describe("A concise title for this chat based on the conversation"),
		lastMessageSummary: z
			.string()
			.max(150)
			.describe("A one-sentence summary of your last response"),
	}),
})

// No execute — a client-side confirmation tool. The loop stops, the call is
// forwarded to the client which runs ExtractPat and feeds the result back.
const analyseSource = tool({
	description:
		"Propose running ExtractPat on a source document to extract structured data (e.g. office action dates, claims, cited references). Use when a source has not been analysed yet and structured data would help answer the user. The user must confirm before it runs. Only US Office Actions and EP Examination Reports can currently be extracted.",
	inputSchema: z.object({
		filename: z
			.string()
			.describe("The source filename to analyse, e.g. 'office-action.pdf'"),
		assetType: z
			.string()
			.optional()
			.describe(
				"Document type id if known (e.g. 'us-office-action', 'ep-examination-report'); omit to auto-detect",
			),
	}),
})

export const chatsRouter = new Hono()

// ─── Chat CRUD ────────────────────────────────────────────────────────────────

chatsRouter.get("/", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	const index = await readChatIndex(taskPath)
	return c.json(index)
})

chatsRouter.post("/", async (c) => {
	const { taskPath, title, id } = await c.req.json<{
		taskPath: string
		title: string
		id?: string
	}>()
	const chatId = id ?? crypto.randomUUID()
	const now = new Date().toISOString()
	const chat: Chat = {
		id: chatId,
		title,
		createdAt: now,
		updatedAt: now,
		messages: [],
	}
	await writeChat(taskPath, chat)
	const index = await readChatIndex(taskPath)
	const entry: ChatIndexEntry = {
		id: chatId,
		title,
		createdAt: now,
		updatedAt: now,
		lastMessagePreview: "",
	}
	await writeChatIndex(taskPath, [...index, entry])
	return c.json(entry, 201)
})

chatsRouter.patch("/:id", async (c) => {
	const chatId = c.req.param("id")
	const { taskPath, title } = await c.req.json<{
		taskPath: string
		title: string
	}>()
	const chat = await readChat(taskPath, chatId)
	if (!chat) return c.json({ error: "Not found" }, 404)
	const now = new Date().toISOString()
	await writeChat(taskPath, { ...chat, title, updatedAt: now })
	const index = await readChatIndex(taskPath)
	const updated = index.map((e) =>
		e.id === chatId ? { ...e, title, updatedAt: now } : e,
	)
	await writeChatIndex(taskPath, updated)
	return c.json({ ...chat, title, updatedAt: now })
})

chatsRouter.delete("/:id", async (c) => {
	const chatId = c.req.param("id")
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	const index = await readChatIndex(taskPath)
	await writeChatIndex(
		taskPath,
		index.filter((e) => e.id !== chatId),
	)
	return c.json({ ok: true })
})

// ─── Messages ─────────────────────────────────────────────────────────────────

chatsRouter.get("/:id/messages", async (c) => {
	const chatId = c.req.param("id")
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	const chat = await readChat(taskPath, chatId)
	if (!chat) return c.json({ error: "Not found" }, 404)
	return c.json(chat.messages)
})

chatsRouter.post("/:id/messages", async (c) => {
	const chatId = c.req.param("id")
	const {
		messages,
		provider,
		apiKey,
		detailedModel,
		taskPath,
		openFilePaths,
		excludedPaths,
	} = await c.req.json<{
		messages: { id: string; role: "user" | "assistant"; parts: unknown[] }[]
		provider: string
		apiKey: string
		detailedModel: string
		taskPath: string
		openFilePaths: string[]
		excludedPaths?: string[]
	}>()

	const excludedSet = new Set(excludedPaths ?? [])

	const settings = await readSettings()

	// Strip generateMetadata tool parts from history — internal scaffolding,
	// adds noise on subsequent turns.
	const cleanedMessages = messages.map((m) => ({
		...m,
		parts: (m.parts as Array<{ type: string }>).filter(
			(p) => p.type !== "tool-generateMetadata",
		),
	}))

	const tasks = await readTasks()
	const taskType = tasks.find((p) => p.path === taskPath)?.taskType
	const analysedSources = await listAnalysis(taskPath)

	const { system, fileParts } = await buildAgentPatPrompt({
		settings,
		taskPath,
		openFilePaths: openFilePaths ?? [],
		taskType,
		analysedSources,
		excludedFiles: [...excludedSet].map((p) => p.split("/").at(-1) ?? p),
	})

	const resolvedProvider = provider || settings.ai.provider
	const keyField = `${resolvedProvider}Key` as
		| "anthropicKey"
		| "openaiKey"
		| "googleKey"
		| "gatewayKey"
	const resolvedKey = apiKey || settings.ai[keyField] || ""
	const resolvedModel = detailedModel || settings.ai.model
	const model = createModel(resolvedProvider, resolvedKey, resolvedModel)
	const { providerOptions } = reasoningOptions(
		resolvedProvider,
		resolvedModel,
		settings.ai.effort,
		settings.ai.showThinking,
	)

	const fsTools = {
		listDirectory: tool({
			description:
				"List files and folders inside a directory in the task folder",
			inputSchema: z.object({
				path: z
					.string()
					.describe(
						"Absolute path to list. Use the task path to list the root.",
					),
			}),
			execute: async ({ path: dirPath }) => {
				const target = dirPath || taskPath
				if (!target.startsWith(taskPath))
					return { error: "Path outside task folder" }
				try {
					const entries = await readdir(target, { withFileTypes: true })
					return entries.map((e) => ({
						name: e.name,
						type: e.isDirectory() ? "directory" : "file",
						path: join(target, e.name),
					}))
				} catch {
					return { error: `Could not list: ${target}` }
				}
			},
		}),
		readFile: tool({
			description:
				"Read the text content of a file in the task folder (use for .txt, .md, .json, .docx — not PDFs, those are injected as file parts)",
			inputSchema: z.object({
				path: z.string().describe("Absolute path to the file"),
			}),
			execute: async ({ path: filePath }) => {
				if (!filePath.startsWith(taskPath))
					return { error: "Path outside task folder" }
				if (excludedSet.has(filePath))
					return {
						error:
							"This document is excluded from AgentPat by the attorney. Do not read or use it.",
					}
				const ext = extname(filePath).toLowerCase()
				try {
					if (ext === ".pdf") {
						const s = await stat(filePath)
						return {
							note: "PDF file — open it in the editor to include it in AI context",
							size: s.size,
						}
					}
					const content = await readFile(filePath, "utf8")
					return { content: content.slice(0, 20000) } // cap at 20k chars
				} catch {
					return { error: `Could not read: ${filePath}` }
				}
			},
		}),
	}

	const epoAuth = settings.integrations
	const epoOpsAuth = {
		consumerKey: epoAuth.epoOpsKey,
		consumerSecret: epoAuth.epoOpsSecret,
	}
	const fetchPatentTool = tool({
		description:
			"Fetch structured patent data from EPO OPS by publication number (e.g. EP1234567, US9876543, WO2020123456)",
		inputSchema: z.object({
			publicationNumber: z.string().describe("Patent publication number"),
		}),
		execute: async ({ publicationNumber }) => {
			try {
				return await fetchPatent(publicationNumber, epoOpsAuth)
			} catch (err) {
				return { error: String(err) }
			}
		},
	})

	const tools = {
		generateMetadata,
		analyseSource,
		...fsTools,
		...(epoAuth.epoOpsKey && epoAuth.epoOpsSecret
			? { fetchPatent: fetchPatentTool }
			: {}),
	}

	const agent = new ToolLoopAgent({
		model,
		instructions: system,
		tools,
		providerOptions,
		prepareCall:
			fileParts.length > 0
				? (baseArgs) => {
						const rawPrompt = (baseArgs as { prompt?: unknown }).prompt
						const modelMessages = Array.isArray(rawPrompt)
							? (rawPrompt as ModelMessage[])
							: []
						return {
							...baseArgs,
							model,
							prompt: [
								{
									role: "user" as const,
									content: [
										{
											type: "text" as const,
											text: "Source documents attached for reference.",
										},
										...fileParts,
									],
								},
								{
									role: "assistant" as const,
									content:
										"I have reviewed the attached source documents and will use them as context throughout our conversation.",
								},
								...modelMessages,
							] as ModelMessage[],
						}
					}
				: undefined,
	})

	return createAgentUIStreamResponse({
		agent,
		uiMessages: cleanedMessages,
		sendReasoning: true,
		// Map a context-window overflow to a sentinel the client recognises; the
		// default would mask it as a generic "an error occurred".
		onError: (error) => {
			const msg = error instanceof Error ? error.message : String(error)
			if (isContextOverflow(msg)) return CONTEXT_OVERFLOW_MARKER
			return "An error occurred while generating the response."
		},
		generateMessageId: () => crypto.randomUUID(),
		messageMetadata: ({ part }) => {
			if (part.type === "finish" && "totalUsage" in part) {
				return { usage: part.totalUsage }
			}
		},
		onFinish: async ({ responseMessage }) => {
			const chat = (await readChat(taskPath, chatId)) ?? {
				id: chatId,
				title: "Untitled",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				messages: [],
			}

			// The client's message list is authoritative for the conversation so far —
			// it includes client-added tool outputs (e.g. analyseSource confirmation)
			// that the server never re-emits. We rebuild from it, preserving original
			// timestamps, then upsert the freshly generated assistant message by id.
			// (Use the un-stripped `messages` so generateMetadata parts survive reload.)
			const existingById = new Map(chat.messages.map((m) => [m.id, m]))
			const toMsg = (m: {
				id: string
				role: "user" | "assistant"
				parts: unknown[]
				metadata?: unknown
			}): ChatMessage => ({
				id: m.id,
				role: m.role,
				parts: m.parts,
				metadata:
					(m.metadata as Record<string, unknown>) ??
					existingById.get(m.id)?.metadata ??
					{},
				createdAt:
					existingById.get(m.id)?.createdAt ?? new Date().toISOString(),
			})

			const byId = new Map<string, ChatMessage>()
			for (const m of messages) byId.set(m.id, toMsg(m))

			const respId = responseMessage.id || crypto.randomUUID()
			byId.set(respId, {
				id: respId,
				role: "assistant",
				parts: responseMessage.parts as unknown[],
				metadata:
					(responseMessage.metadata as Record<string, unknown>) ??
					existingById.get(respId)?.metadata ??
					{},
				createdAt:
					existingById.get(respId)?.createdAt ?? new Date().toISOString(),
			})

			const newMessages = [...byId.values()]

			const now = new Date().toISOString()
			const lastText = newMessages
				.filter((m) => m.role === "assistant")
				.at(-1)
				?.parts.find((p: unknown) => (p as { type: string }).type === "text") as
				| { type: string; text: string }
				| undefined

			const updatedChat: Chat = {
				...chat,
				messages: newMessages,
				updatedAt: now,
			}
			await writeChat(taskPath, updatedChat)

			const index = await readChatIndex(taskPath)
			const updatedIndex = index.map((e) =>
				e.id === chatId
					? {
							...e,
							updatedAt: now,
							lastMessagePreview: lastText?.text?.slice(0, 120) ?? "",
						}
					: e,
			)
			await writeChatIndex(taskPath, updatedIndex)
		},
	})
})
