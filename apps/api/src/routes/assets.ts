import { type AssetKind, type AssetType, assets } from "@patrickos/db"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../lib/db"

export const assetsRouter = new Hono()

assetsRouter.get("/", async (c) => {
	const projectId = c.req.query("projectId")
	const rows = projectId
		? await db.select().from(assets).where(eq(assets.projectId, projectId))
		: await db.select().from(assets)
	return c.json(rows)
})

assetsRouter.get("/:id", async (c) => {
	const [row] = await db
		.select()
		.from(assets)
		.where(eq(assets.id, c.req.param("id")))
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

assetsRouter.post("/", async (c) => {
	const {
		projectId,
		title,
		content = "",
		type = "claims-draft",
		kind = "artifact",
		date = "",
		notes = "",
	} = await c.req.json<{
		projectId: string
		title: string
		content?: string
		type?: AssetType
		kind?: AssetKind
		date?: string
		notes?: string
	}>()
	const now = new Date()
	const [row] = await db
		.insert(assets)
		.values({
			id: crypto.randomUUID(),
			projectId,
			title,
			content,
			type,
			kind,
			date,
			notes,
			createdAt: now,
			updatedAt: now,
		})
		.returning()
	return c.json(row, 201)
})

assetsRouter.put("/:id", async (c) => {
	const body = await c.req.json<{
		title?: string
		content?: string
		type?: string
		kind?: string
		date?: string
		notes?: string
	}>()
	const patch = Object.fromEntries(
		Object.entries(body).filter(([, v]) => v !== undefined),
	)
	const [row] = await db
		.update(assets)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(assets.id, c.req.param("id")))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

assetsRouter.delete("/:id", async (c) => {
	const [row] = await db
		.delete(assets)
		.where(eq(assets.id, c.req.param("id")))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json({ ok: true })
})
