import { type AssetKind, type AssetType, assets, eq } from "@patrickos/db"
import { Hono } from "hono"
import { db } from "../lib/db"

export const assetsRouter = new Hono()

// Never send the data blob in list/get responses
const safeColumns = {
	id: assets.id,
	projectId: assets.projectId,
	title: assets.title,
	content: assets.content,
	type: assets.type,
	kind: assets.kind,
	date: assets.date,
	notes: assets.notes,
	metadata: assets.metadata,
	details: assets.details,
	createdAt: assets.createdAt,
	updatedAt: assets.updatedAt,
}

assetsRouter.get("/", async (c) => {
	const projectId = c.req.query("projectId")
	const rows = projectId
		? await db
				.select(safeColumns)
				.from(assets)
				.where(eq(assets.projectId, projectId))
		: await db.select(safeColumns).from(assets)
	return c.json(rows)
})

assetsRouter.get("/:id", async (c) => {
	const [row] = await db
		.select(safeColumns)
		.from(assets)
		.where(eq(assets.id, c.req.param("id")))
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json(row)
})

assetsRouter.get("/:id/file", async (c) => {
	const [row] = await db
		.select({ data: assets.data })
		.from(assets)
		.where(eq(assets.id, c.req.param("id")))
	if (!row?.data) return c.json({ error: "Not found" }, 404)
	return new Response(row.data as BodyInit, {
		headers: {
			"Content-Type": "application/pdf",
			"Cache-Control": "private, max-age=3600",
		},
	})
})

assetsRouter.post("/", async (c) => {
	const contentType = c.req.header("content-type") ?? ""
	const now = new Date()

	if (contentType.includes("multipart/form-data")) {
		const form = await c.req.formData()
		const file = form.get("file")
		const projectId = form.get("projectId") as string
		const title = form.get("title") as string
		const type = (form.get("type") as AssetType) ?? "inventor-disclosure"
		const date = (form.get("date") as string) ?? ""
		const notes = (form.get("notes") as string) ?? ""
		const details = (form.get("details") as string) || null

		const data =
			file instanceof File ? Buffer.from(await file.arrayBuffer()) : null

		const [row] = await db
			.insert(assets)
			.values({
				id: crypto.randomUUID(),
				projectId,
				title: title || "Untitled",
				content: "",
				type,
				kind: "source",
				date,
				notes,
				data,
				metadata: "{}",
				details,
				createdAt: now,
				updatedAt: now,
			})
			.returning()

		const { data: _, ...safe } = row
		return c.json(safe, 201)
	}

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
			data: null,
			metadata: "{}",
			createdAt: now,
			updatedAt: now,
		})
		.returning()

	const { data: _, ...safe } = row
	return c.json(safe, 201)
})

assetsRouter.put("/:id", async (c) => {
	const body = await c.req.json<{
		title?: string
		content?: string
		type?: string
		kind?: string
		date?: string
		notes?: string
		metadata?: string
		details?: string | null
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
	const { data: _, ...safe } = row
	return c.json(safe)
})

assetsRouter.delete("/:id", async (c) => {
	const [row] = await db
		.delete(assets)
		.where(eq(assets.id, c.req.param("id")))
		.returning()
	if (!row) return c.json({ error: "Not found" }, 404)
	return c.json({ ok: true })
})
