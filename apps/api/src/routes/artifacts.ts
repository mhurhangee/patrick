import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { db } from "../lib/db"
import { artifacts } from "@patrickos/db"

export const artifactsRouter = new Hono()

artifactsRouter.get("/", async (c) => {
	const projectId = c.req.query("projectId")
	const rows = projectId
		? await db.select().from(artifacts).where(eq(artifacts.projectId, projectId))
		: await db.select().from(artifacts)
	return c.json(rows)
})

artifactsRouter.get("/:id", async (c) => {
	const [row] = await db.select().from(artifacts).where(eq(artifacts.id, c.req.param("id")))
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

artifactsRouter.post("/", async (c) => {
	const { projectId, title, content = "" } = await c.req.json<{
		projectId: string
		title: string
		content?: string
	}>()
	const now = new Date()
	const [row] = await db
		.insert(artifacts)
		.values({ id: crypto.randomUUID(), projectId, title, content, createdAt: now, updatedAt: now })
		.returning()
	return c.json(row, 201)
})

artifactsRouter.put("/:id", async (c) => {
	const { title, content } = await c.req.json<{ title?: string; content?: string }>()
	const [row] = await db
		.update(artifacts)
		.set({ ...(title !== undefined && { title }), ...(content !== undefined && { content }), updatedAt: new Date() })
		.where(eq(artifacts.id, c.req.param("id")))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})
