import { ASSET_CONFIGS, assets, eq, settings } from "@patrickos/db"
import { generateText, Output } from "ai"
import { Hono } from "hono"
import type { z } from "zod"
import { db } from "../lib/db"
import { createModel } from "../lib/patent-prompt"

export const extractpatRouter = new Hono()

async function loadSystemPrompt(): Promise<string | undefined> {
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	return row?.promptExtractpat || undefined
}

extractpatRouter.post("/extract", async (c) => {
	const {
		assetId,
		provider,
		apiKey,
		model: modelId,
	} = await c.req.json<{
		assetId: string
		provider: string
		apiKey: string
		model: string
	}>()

	const [asset] = await db.select().from(assets).where(eq(assets.id, assetId))
	if (!asset) return c.json({ error: "Asset not found" }, 404)
	if (!asset.data) return c.json({ error: "Asset has no file data" }, 400)

	const match = ASSET_CONFIGS.find((c) => c.id === asset.type)
	if (!match || !("schema" in match))
		return c.json(
			{ error: `No extraction schema for type: ${asset.type}` },
			400,
		)

	// biome-ignore lint/suspicious/noExplicitAny: schema presence verified above
	const schema = (match as any).schema as z.ZodObject<z.ZodRawShape>
	if (!schema.description)
		return c.json(
			{ error: `No extraction schema for type: ${asset.type}` },
			400,
		)
	const system = await loadSystemPrompt()
	const model = createModel(provider, apiKey, modelId)

	const { output: object } = await generateText({
		model,
		system,
		output: Output.object({ schema }),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: schema.description },
					{
						type: "file",
						data: asset.data as Buffer,
						mediaType: "application/pdf",
					},
				],
			},
		],
	})

	return c.json({ extracted: object, assetType: asset.type })
})
