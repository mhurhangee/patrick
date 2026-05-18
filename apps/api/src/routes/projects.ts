import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { db } from "../lib/db"
import { projects, assets } from "@patrickos/db"

export const projectsRouter = new Hono()

projectsRouter.get("/", async (c) => {
	const rows = await db.select().from(projects)
	return c.json(rows)
})

projectsRouter.get("/:id", async (c) => {
	const [row] = await db.select().from(projects).where(eq(projects.id, c.req.param("id")))
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

projectsRouter.post("/", async (c) => {
	const { name } = await c.req.json<{ name: string }>()
	const now = new Date()
	const [row] = await db
		.insert(projects)
		.values({ id: crypto.randomUUID(), name, createdAt: now, updatedAt: now })
		.returning()
	return c.json(row, 201)
})

projectsRouter.put("/:id", async (c) => {
	const { name } = await c.req.json<{ name: string }>()
	const [row] = await db
		.update(projects)
		.set({ name, updatedAt: new Date() })
		.where(eq(projects.id, c.req.param("id")))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

projectsRouter.delete("/:id", async (c) => {
	const id = c.req.param("id")
	// Delete artifacts first — SQLite FK enforcement is on but no CASCADE defined
	await db.delete(assets).where(eq(assets.projectId, id))
	const [row] = await db.delete(projects).where(eq(projects.id, id)).returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json({ ok: true })
})
