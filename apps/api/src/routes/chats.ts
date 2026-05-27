import {
	assets,
	chatMessages,
	chats,
	eq,
	projects,
	settings,
} from "@patrickos/db"
import type { ModelMessage } from "ai"
import { createAgentUIStreamResponse, ToolLoopAgent } from "ai"
import { Hono } from "hono"
import { db } from "../lib/db"
import { buildAgentPatSystemPrompt, createModel } from "../lib/patent-prompt"

export const chatsRouter = new Hono()

// ─── Chat CRUD ────────────────────────────────────────────────────────────────

chatsRouter.get("/", async (c) => {
	const projectId = c.req.query("projectId")
	if (!projectId) return c.json({ error: "projectId required" }, 400)
	const rows = await db
		.select()
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
	return c.json(rows.map((r) => ({ ...r, parts: JSON.parse(r.parts) })))
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
	const [settingsResult, projectResult, allAssetsResult] = await Promise.all([
		db.select().from(settings).where(eq(settings.id, "local")),
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

	const settingsRow = settingsResult[0]
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
	const pdfAttachedIds = pdfSources.map((b) => b.id)

	// Persist the incoming user message (last message in the array)
	const userMsg = messages.at(-1)
	if (userMsg?.role === "user") {
		await db.insert(chatMessages).values({
			id: userMsg.id ?? crypto.randomUUID(),
			chatId,
			role: "user",
			parts: JSON.stringify(userMsg.parts),
			createdAt: new Date(),
		})
	}

	const systemPrompt = buildAgentPatSystemPrompt({
		settingsRow,
		projectRow,
		allAssets: allAssetsResult,
		openAssetIds: openIds,
		pdfAttachedIds,
	})

	const model = createModel(provider, apiKey, detailedModel)

	const agent = new ToolLoopAgent({
		model,
		instructions: systemPrompt,
		// Injects open source PDFs as native file parts before the conversation
		// so the model reads them directly. Only runs when there are PDFs to inject.
		prepareCall:
			pdfSources.length > 0
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
											text: `The following source document${pdfSources.length > 1 ? "s are" : " is"} attached for your reference:${pdfSources.map((b) => `\n- ${b.title}`).join("")}`,
										},
										...pdfSources.map((b) => ({
											type: "file" as const,
											data: b.data as Uint8Array,
											mediaType: "application/pdf" as const,
										})),
									],
								},
								{
									role: "assistant" as const,
									content:
										"I have reviewed the attached source document(s) and will use them as context throughout our conversation.",
								},
								...modelMessages,
							] as ModelMessage[],
						}
					}
				: undefined,
	})

	return createAgentUIStreamResponse({
		agent,
		uiMessages: messages,
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
				createdAt: new Date(),
			})
		},
	})
})
