import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import type { Chat, ChatIndexEntry, ChatMessage } from "@patrickos/shared"
import type { ModelMessage } from "ai"
import { createAgentUIStreamResponse, ToolLoopAgent, tool } from "ai"
import { Hono } from "hono"
import { z } from "zod"
import { fetchPatent } from "../lib/epo-ops"
import {
	readChat,
	readChatIndex,
	readSettings,
	writeChat,
	writeChatIndex,
} from "../lib/fs"
import { buildAgentPatPrompt, createModel } from "../lib/patent-prompt"

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
	const projectPath = c.req.query("projectPath")
	if (!projectPath) return c.json({ error: "projectPath required" }, 400)
	const index = await readChatIndex(projectPath)
	return c.json(index)
})

chatsRouter.post("/", async (c) => {
	const { projectPath, title, id } = await c.req.json<{
		projectPath: string
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
	await writeChat(projectPath, chat)
	const index = await readChatIndex(projectPath)
	const entry: ChatIndexEntry = {
		id: chatId,
		title,
		createdAt: now,
		updatedAt: now,
		lastMessagePreview: "",
	}
	await writeChatIndex(projectPath, [...index, entry])
	return c.json(entry, 201)
})

chatsRouter.patch("/:id", async (c) => {
	const chatId = c.req.param("id")
	const { projectPath, title } = await c.req.json<{
		projectPath: string
		title: string
	}>()
	const chat = await readChat(projectPath, chatId)
	if (!chat) return c.json({ error: "Not found" }, 404)
	const now = new Date().toISOString()
	await writeChat(projectPath, { ...chat, title, updatedAt: now })
	const index = await readChatIndex(projectPath)
	const updated = index.map((e) =>
		e.id === chatId ? { ...e, title, updatedAt: now } : e,
	)
	await writeChatIndex(projectPath, updated)
	return c.json({ ...chat, title, updatedAt: now })
})

chatsRouter.delete("/:id", async (c) => {
	const chatId = c.req.param("id")
	const projectPath = c.req.query("projectPath")
	if (!projectPath) return c.json({ error: "projectPath required" }, 400)
	const index = await readChatIndex(projectPath)
	await writeChatIndex(
		projectPath,
		index.filter((e) => e.id !== chatId),
	)
	return c.json({ ok: true })
})

// ─── Messages ─────────────────────────────────────────────────────────────────

chatsRouter.get("/:id/messages", async (c) => {
	const chatId = c.req.param("id")
	const projectPath = c.req.query("projectPath")
	if (!projectPath) return c.json({ error: "projectPath required" }, 400)
	const chat = await readChat(projectPath, chatId)
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
		projectPath,
		openFilePaths,
	} = await c.req.json<{
		messages: { id: string; role: "user" | "assistant"; parts: unknown[] }[]
		provider: string
		apiKey: string
		detailedModel: string
		projectPath: string
		openFilePaths: string[]
	}>()

	const settings = await readSettings()

	// Strip generateMetadata tool parts from history — internal scaffolding,
	// adds noise on subsequent turns.
	const cleanedMessages = messages.map((m) => ({
		...m,
		parts: (m.parts as Array<{ type: string }>).filter(
			(p) => p.type !== "tool-generateMetadata",
		),
	}))

	const { system, fileParts } = await buildAgentPatPrompt({
		settings,
		projectPath,
		openFilePaths: openFilePaths ?? [],
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

	const fsTools = {
		listDirectory: tool({
			description:
				"List files and folders inside a directory in the matter folder",
			inputSchema: z.object({
				path: z
					.string()
					.describe(
						"Absolute path to list. Use the project path to list the root.",
					),
			}),
			execute: async ({ path: dirPath }) => {
				const target = dirPath || projectPath
				if (!target.startsWith(projectPath))
					return { error: "Path outside project folder" }
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
				"Read the text content of a file in the matter folder (use for .txt, .md, .json, .docx — not PDFs, those are injected as file parts)",
			inputSchema: z.object({
				path: z.string().describe("Absolute path to the file"),
			}),
			execute: async ({ path: filePath }) => {
				if (!filePath.startsWith(projectPath))
					return { error: "Path outside project folder" }
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
		generateMessageId: () => crypto.randomUUID(),
		messageMetadata: ({ part }) => {
			if (part.type === "finish" && "totalUsage" in part) {
				return { usage: part.totalUsage }
			}
		},
		onFinish: async ({ responseMessage }) => {
			const chat = (await readChat(projectPath, chatId)) ?? {
				id: chatId,
				title: "Untitled",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				messages: [],
			}

			// Persist incoming user message if not already saved
			const userMsg = cleanedMessages.at(-1)
			const existingIds = new Set(chat.messages.map((m) => m.id))
			const newMessages: ChatMessage[] = [...chat.messages]

			if (userMsg?.role === "user" && !existingIds.has(userMsg.id)) {
				newMessages.push({
					id: userMsg.id,
					role: "user",
					parts: userMsg.parts,
					metadata: {},
					createdAt: new Date().toISOString(),
				})
			}

			newMessages.push({
				id: responseMessage.id || crypto.randomUUID(),
				role: "assistant",
				parts: responseMessage.parts as unknown[],
				metadata: (responseMessage.metadata as Record<string, unknown>) ?? {},
				createdAt: new Date().toISOString(),
			})

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
			await writeChat(projectPath, updatedChat)

			const index = await readChatIndex(projectPath)
			const updatedIndex = index.map((e) =>
				e.id === chatId
					? {
							...e,
							updatedAt: now,
							lastMessagePreview: lastText?.text?.slice(0, 120) ?? "",
						}
					: e,
			)
			await writeChatIndex(projectPath, updatedIndex)
		},
	})
})
