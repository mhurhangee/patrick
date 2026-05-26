import { assets, eq, type ProjectType, projects } from "@patrickos/db"
import { Hono } from "hono"
import { db } from "../lib/db"

export const projectsRouter = new Hono()

projectsRouter.get("/", async (c) => {
	const rows = await db.select().from(projects)
	return c.json(rows)
})

projectsRouter.get("/:id", async (c) => {
	const [row] = await db
		.select()
		.from(projects)
		.where(eq(projects.id, c.req.param("id")))
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

projectsRouter.post("/", async (c) => {
	const { name, type = "office-action-response" } = await c.req.json<{
		name: string
		type?: ProjectType
	}>()
	const now = new Date()
	const [row] = await db
		.insert(projects)
		.values({
			id: crypto.randomUUID(),
			name,
			type,
			createdAt: now,
			updatedAt: now,
		})
		.returning()
	return c.json(row, 201)
})

projectsRouter.put("/:id", async (c) => {
	const body = await c.req.json<{ name?: string; type?: ProjectType }>()
	const patch = Object.fromEntries(
		Object.entries(body).filter(([, v]) => v !== undefined),
	)
	const [row] = await db
		.update(projects)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(projects.id, c.req.param("id")))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

projectsRouter.delete("/:id", async (c) => {
	const id = c.req.param("id")
	await db.delete(assets).where(eq(assets.projectId, id))
	const [row] = await db.delete(projects).where(eq(projects.id, id)).returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json({ ok: true })
})
