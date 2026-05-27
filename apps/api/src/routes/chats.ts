import { chatMessages, chats, eq, settings } from "@patrickos/db"
import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	streamText,
} from "ai"
import { Hono } from "hono"
import { db } from "../lib/db"
import { createModel } from "../lib/patent-prompt"

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
	const { messages, provider, apiKey, quickModel } = await c.req.json<{
		messages: { id: string; role: "user" | "assistant"; parts: unknown[] }[]
		provider: string
		apiKey: string
		quickModel: string
	}>()

	const [settingsRow] = await db
		.select()
		.from(settings)
		.where(eq(settings.id, "local"))
	const model = createModel(provider, apiKey, quickModel)

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

	const systemPrompt = [
		"You are AgentPat, an expert AI patent attorney assistant.",
		settingsRow?.promptAgentpat,
		settingsRow?.promptContext,
	]
		.filter(Boolean)
		.join("\n\n")

	// Build plain text history for streamText
	const history = messages.slice(0, -1).map((m) => ({
		role: m.role,
		content: m.parts
			.filter(
				(p): p is { type: "text"; text: string } =>
					(p as { type: string }).type === "text",
			)
			.map((p) => p.text)
			.join(""),
	}))

	const lastUserText = (userMsg?.parts ?? [])
		.filter(
			(p): p is { type: "text"; text: string } =>
				(p as { type: string }).type === "text",
		)
		.map((p) => p.text)
		.join("")

	let assistantParts: unknown[] = []

	const stream = createUIMessageStream({
		execute: async ({ writer }) => {
			const result = streamText({
				model,
				system: systemPrompt,
				messages: [...history, { role: "user", content: lastUserText }],
				onFinish: async ({ text }) => {
					assistantParts = [{ type: "text", text }]
					await db.insert(chatMessages).values({
						id: crypto.randomUUID(),
						chatId,
						role: "assistant",
						parts: JSON.stringify(assistantParts),
						createdAt: new Date(),
					})
				},
			})
			writer.merge(
				result.toUIMessageStream({
					messageMetadata: ({ part }) => {
						if (part.type === "finish" && "totalUsage" in part) {
							return { usage: part.totalUsage }
						}
					},
				}),
			)
		},
	})

	return createUIMessageStreamResponse({ stream })
})
