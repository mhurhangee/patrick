import { eq, settings } from "@patrickos/db"
import { Hono } from "hono"
import { db } from "../lib/db"

export const settingsRouter = new Hono()

settingsRouter.get("/", async (c) => {
	await db.insert(settings).values({ id: "local" }).onConflictDoNothing()
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	return c.json(row)
})

settingsRouter.put("/", async (c) => {
	const patch =
		await c.req.json<
			Partial<{
				name: string
				firm: string
				role: string
				jurisdiction: string
				aiProvider: string
				aiQuickModel: string
				aiDetailedModel: string
				promptContext: string
				promptAskpat: string
				promptAgentpat: string
				promptExtractpat: string
			}>
		>()
	await db.insert(settings).values({ id: "local" }).onConflictDoNothing()
	const [row] = await db
		.update(settings)
		.set(patch)
		.where(eq(settings.id, "local"))
		.returning()
	return c.json(row)
})
