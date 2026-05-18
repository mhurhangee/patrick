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
	const { projectId, title, content = "", type = "claims-draft", kind = "draft", date = "", notes = "" } =
		await c.req.json<{
			projectId: string
			title: string
			content?: string
			type?: string
			kind?: string
			date?: string
			notes?: string
		}>()
	const now = new Date()
	const [row] = await db
		.insert(artifacts)
		.values({ id: crypto.randomUUID(), projectId, title, content, type, kind, date, notes, createdAt: now, updatedAt: now })
		.returning()
	return c.json(row, 201)
})

artifactsRouter.put("/:id", async (c) => {
	const body = await c.req.json<{
		title?: string
		content?: string
		type?: string
		kind?: string
		date?: string
		notes?: string
	}>()
	const patch = Object.fromEntries(
		Object.entries(body).filter(([, v]) => v !== undefined)
	)
	const [row] = await db
		.update(artifacts)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(artifacts.id, c.req.param("id")))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

artifactsRouter.delete("/:id", async (c) => {
	const [row] = await db
		.delete(artifacts)
		.where(eq(artifacts.id, c.req.param("id")))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json({ ok: true })
})
