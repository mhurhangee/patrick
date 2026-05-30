import {
	asc,
	assets,
	chatMessages,
	chats,
	eq,
	projects,
	sql,
} from "@patrickos/db"
import type { ModelMessage } from "ai"
import { createAgentUIStreamResponse, ToolLoopAgent, tool } from "ai"
import { Hono } from "hono"
import { z } from "zod"
import { db } from "../lib/db"
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

export const chatsRouter = new Hono()

// ─── Chat CRUD ────────────────────────────────────────────────────────────────

chatsRouter.get("/", async (c) => {
	const projectId = c.req.query("projectId")
	if (!projectId) return c.json({ error: "projectId required" }, 400)
	const rows = await db
		.select({
			id: chats.id,
			projectId: chats.projectId,
			title: chats.title,
			createdAt: chats.createdAt,
			updatedAt: chats.updatedAt,
			messageCount: sql<number>`(select count(*) from chat_messages where chat_id = ${chats.id} and role = 'user')`,
		})
		.from(chats)
		.where(eq(chats.projectId, projectId))
	return c.json(rows)
})

chatsRouter.post("/", async (c) => {
	const { projectId, title, id } = await c.req.json<{
		projectId: string
		title: string
		id?: string
	}>()
	const now = new Date()
	const [row] = await db
		.insert(chats)
		.values({
			id: id ?? crypto.randomUUID(),
			projectId,
			title,
			createdAt: now,
			updatedAt: now,
		})
		.returning()
	return c.json(row, 201)
})

chatsRouter.patch("/:id", async (c) => {
	const id = c.req.param("id")
	const { title } = await c.req.json<{ title: string }>()
	const [row] = await db
		.update(chats)
		.set({ title, updatedAt: new Date() })
		.where(eq(chats.id, id))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

chatsRouter.delete("/:id", async (c) => {
	const id = c.req.param("id")
	await db.delete(chatMessages).where(eq(chatMessages.chatId, id))
	const [row] = await db.delete(chats).where(eq(chats.id, id)).returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json({ ok: true })
})

// ─── Messages ─────────────────────────────────────────────────────────────────

chatsRouter.get("/:id/messages", async (c) => {
	const rows = await db
		.select()
		.from(chatMessages)
		.where(eq(chatMessages.chatId, c.req.param("id")))
		.orderBy(asc(chatMessages.createdAt))
	return c.json(
		rows.map((r) => ({
			...r,
			parts: JSON.parse(r.parts),
			metadata: JSON.parse(r.metadata),
		})),
	)
})

chatsRouter.post("/:id/messages", async (c) => {
	const chatId = c.req.param("id")
	const { messages, provider, apiKey, detailedModel, projectId, openAssetIds } =
		await c.req.json<{
			messages: { id: string; role: "user" | "assistant"; parts: unknown[] }[]
			provider: string
			apiKey: string
			detailedModel: string
			projectId: string
			openAssetIds: string[]
		}>()

	// Load context from DB in parallel
	const [projectResult, allAssetsResult] = await Promise.all([
		projectId
			? db.select().from(projects).where(eq(projects.id, projectId))
			: Promise.resolve([]),
		projectId
			? db
					.select({
						id: assets.id,
						title: assets.title,
						type: assets.type,
						kind: assets.kind,
						date: assets.date,
						content: assets.content,
						details: assets.details,
					})
					.from(assets)
					.where(eq(assets.projectId, projectId))
			: Promise.resolve([]),
	])

	const projectRow = projectResult[0]

	// Load PDF blobs for open source assets — separate query since we exclude
	// the data blob from the main asset list query for performance
	const openIds = openAssetIds ?? []
	const openSourceIds = allAssetsResult
		.filter((a) => openIds.includes(a.id) && a.kind === "source")
		.map((a) => a.id)

	const openSourceBlobs = await Promise.all(
		openSourceIds.map((id) =>
			db
				.select({ id: assets.id, title: assets.title, data: assets.data })
				.from(assets)
				.where(eq(assets.id, id))
				.then((rows) => rows[0]),
		),
	)
	// Only keep sources that actually have a PDF uploaded
	const pdfSources = openSourceBlobs.filter(
		(b): b is { id: string; title: string; data: NonNullable<typeof b.data> } =>
			!!b?.data,
	)

	// Strip generateMetadata tool parts from history — they're internal scaffolding
	// and add noise to the model's context on subsequent turns.
	const cleanedMessages = messages.map((m) => ({
		...m,
		parts: (m.parts as Array<{ type: string }>).filter(
			(p) => p.type !== "tool-generateMetadata",
		),
	}))

	// Persist the incoming user message (last message in the array)
	const userMsg = cleanedMessages.at(-1)
	if (userMsg?.role === "user") {
		await db.insert(chatMessages).values({
			id: userMsg.id ?? crypto.randomUUID(),
			chatId,
			role: "user",
			parts: JSON.stringify(userMsg.parts),
			createdAt: new Date(),
		})
	}

	const { system, fileParts } = await buildAgentPatPrompt({
		project: projectRow,
		allAssets: allAssetsResult,
		openAssetIds: openIds,
		pdfSources,
	})

	const model = createModel(provider, apiKey, detailedModel)

	const agent = new ToolLoopAgent({
		model,
		instructions: system,
		tools: { generateMetadata },
		// Injects open source PDFs as native file parts before the conversation
		// so the model reads them directly. Only runs when there are PDFs to inject.
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
		generateMessageId: () => crypto.randomUUID(),
		messageMetadata: ({ part }) => {
			if (part.type === "finish" && "totalUsage" in part) {
				return { usage: part.totalUsage }
			}
		},
		onFinish: async ({ responseMessage }) => {
			await db.insert(chatMessages).values({
				id: responseMessage.id || crypto.randomUUID(),
				chatId,
				role: "assistant",
				parts: JSON.stringify(responseMessage.parts),
				metadata: JSON.stringify(responseMessage.metadata ?? {}),
				createdAt: new Date(),
			})
		},
	})
})
