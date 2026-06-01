import { readFile } from "node:fs/promises"
import { ASSET_CONFIGS } from "@patrickos/shared"
import { generateText, Output } from "ai"
import { Hono } from "hono"
import type { z } from "zod"
import { readSettings } from "../lib/fs"
import { buildExtractPatPrompt, createModel } from "../lib/patent-prompt"

export const extractpatRouter = new Hono()

extractpatRouter.post("/extract", async (c) => {
	const {
		filePath,
		assetType,
		provider,
		apiKey,
		model: modelId,
	} = await c.req.json<{
		filePath: string
		assetType: string
		provider: string
		apiKey: string
		model: string
	}>()

	const match = ASSET_CONFIGS.find((cfg) => cfg.id === assetType)
	if (!match || !("schema" in match))
		return c.json({ error: `No extraction schema for type: ${assetType}` }, 400)

	// biome-ignore lint/suspicious/noExplicitAny: schema presence verified above
	const schema = (match as any).schema as z.ZodObject<z.ZodRawShape>
	if (!schema.description)
		return c.json({ error: `No extraction schema for type: ${assetType}` }, 400)

	let fileData: Buffer
	try {
		fileData = await readFile(filePath)
	} catch {
		return c.json({ error: "File not found or unreadable" }, 404)
	}

	const settings = await readSettings()
	const systemStr = await buildExtractPatPrompt(settings)
	const resolvedProvider = provider || settings.ai.provider
	const keyField = `${resolvedProvider}Key` as "anthropicKey" | "openaiKey" | "googleKey" | "gatewayKey"
	const resolvedKey = apiKey || settings.ai[keyField] || ""
	const resolvedModel = modelId || settings.ai.model
	const model = createModel(resolvedProvider, resolvedKey, resolvedModel)

	const { output: object } = await generateText({
		model,
		system: systemStr,
		output: Output.object({ schema }),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: schema.description },
					{ type: "file", data: fileData, mediaType: "application/pdf" },
				],
			},
		],
	})

	return c.json({ extracted: object, assetType })
})
