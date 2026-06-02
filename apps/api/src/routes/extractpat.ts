import { readFile } from "node:fs/promises"
import { basename, dirname } from "node:path"
import {
	type AnalysisRecord,
	ASSET_CONFIGS,
	allowedAssetTypesFor,
	extractLocationMap,
	isExtractable,
	mergeExtracted,
} from "@patrickos/shared"
import { generateText, Output, streamText } from "ai"
import { Hono } from "hono"
import { stream } from "hono/streaming"
import { z } from "zod"
import { readSettings, readTasks, writeAnalysis } from "../lib/fs"
import { buildExtractPatPrompt, createModel } from "../lib/patent-prompt"

export const extractpatRouter = new Hono()

// Source types ExtractPat can pull structured data from (have an extraction schema).
const EXTRACTABLE_SOURCES = ASSET_CONFIGS.filter(
	(c) => c.kind === "source" && isExtractable(c.id),
)

function schemaFor(assetType: string): z.ZodObject<z.ZodRawShape> | null {
	const match = ASSET_CONFIGS.find((c) => c.id === assetType)
	if (!match || !("schema" in match)) return null
	const schema = match.schema as z.ZodObject<z.ZodRawShape>
	if (!schema.description) return null
	return schema
}

async function classify(
	// biome-ignore lint/suspicious/noExplicitAny: model type from createModel
	model: any,
	fileData: Buffer,
	candidates: typeof EXTRACTABLE_SOURCES,
): Promise<string> {
	// Include an "other" escape hatch so the model isn't forced to mislabel a
	// document (e.g. prior art) as one of the extractable types.
	const ids: [string, ...string[]] = [
		"other",
		...candidates.map((c) => c.id as string),
	]
	const list = candidates
		.map((c) => `- ${c.id}: ${c.typeLabel} — ${c.aiContext}`)
		.concat(
			"- other: anything that does not clearly match one of the above (prior art, the application itself, client correspondence, etc.)",
		)
		.join("\n")
	const { output } = await generateText({
		model,
		system:
			'You are a patent document classifier. Choose the single best-matching type id for the attached document. If it does not clearly match one of the listed types, choose "other". Respond only via the structured output.',
		output: Output.object({
			schema: z.object({ assetType: z.enum(ids) }),
		}),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: `Candidate types:\n${list}` },
					{ type: "file", data: fileData, mediaType: "application/pdf" },
				],
			},
		],
	})
	return output.assetType
}

// Extractable source types relevant to the file's task (falls back to all).
async function candidatesFor(filePath: string) {
	const tasks = await readTasks()
	const taskType = tasks.find((t) => t.path === dirname(filePath))?.taskType
	const allowed = allowedAssetTypesFor(taskType)
	const filtered = allowed
		? EXTRACTABLE_SOURCES.filter((c) => allowed.includes(c.id))
		: EXTRACTABLE_SOURCES
	return filtered.length ? filtered : EXTRACTABLE_SOURCES
}

extractpatRouter.post("/extract", async (c) => {
	const {
		filePath,
		assetType,
		provider,
		apiKey,
		model: modelId,
	} = await c.req.json<{
		filePath: string
		assetType: string // specific type id, or "auto"
		provider: string
		apiKey: string
		model: string
	}>()

	let fileData: Buffer
	try {
		fileData = await readFile(filePath)
	} catch {
		return c.json({ error: "File not found or unreadable" }, 404)
	}

	const settings = await readSettings()
	const resolvedProvider = provider || settings.ai.provider
	const keyField = `${resolvedProvider}Key` as
		| "anthropicKey"
		| "openaiKey"
		| "googleKey"
		| "gatewayKey"
	const resolvedKey = apiKey || settings.ai[keyField] || ""
	const resolvedModel = modelId || settings.ai.model
	const model = createModel(resolvedProvider, resolvedKey, resolvedModel)

	// Resolve the type — auto-classify when not specified.
	const resolvedType =
		assetType && assetType !== "auto"
			? assetType
			: await classify(model, fileData, await candidatesFor(filePath))

	if (resolvedType === "other")
		return c.json(
			{
				error:
					"Couldn't match this document to a supported type (currently US Office Actions and EP Examination Reports). Pick a type manually if you know it, or leave it un-analysed for now.",
			},
			422,
		)

	const schema = schemaFor(resolvedType)
	if (!schema)
		return c.json(
			{ error: `No extraction schema for type: ${resolvedType}` },
			400,
		)

	const systemStr = await buildExtractPatPrompt(settings)
	const { output: extracted } = await generateText({
		model,
		system: systemStr,
		output: Output.object({ schema }),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: schema.description ?? "" },
					{ type: "file", data: fileData, mediaType: "application/pdf" },
				],
			},
		],
	})

	const now = new Date().toISOString()
	const record: AnalysisRecord = {
		filename: basename(filePath),
		assetType: resolvedType,
		details: mergeExtracted(resolvedType, extracted),
		locations: extractLocationMap(extracted),
		extractedAt: now,
		updatedAt: now,
	}
	await writeAnalysis(dirname(filePath), record)

	return c.json(record)
})

// Streaming variant for the Analysis tab — emits NDJSON lines:
//   {type:"meta", assetType}      once the type is resolved (so the UI can show skeletons)
//   {type:"partial", object}      repeatedly as fields stream in
//   {type:"done", record}         the final persisted AnalysisRecord
//   {type:"error", message}       if extraction fails mid-stream
extractpatRouter.post("/extract/stream", async (c) => {
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

	let fileData: Buffer
	try {
		fileData = await readFile(filePath)
	} catch {
		return c.json({ error: "File not found or unreadable" }, 404)
	}

	const settings = await readSettings()
	const resolvedProvider = provider || settings.ai.provider
	const keyField = `${resolvedProvider}Key` as
		| "anthropicKey"
		| "openaiKey"
		| "googleKey"
		| "gatewayKey"
	const resolvedKey = apiKey || settings.ai[keyField] || ""
	const resolvedModel = modelId || settings.ai.model
	const model = createModel(resolvedProvider, resolvedKey, resolvedModel)

	const resolvedType =
		assetType && assetType !== "auto"
			? assetType
			: await classify(model, fileData, await candidatesFor(filePath))

	if (resolvedType === "other")
		return c.json(
			{
				error:
					"Couldn't match this document to a supported type (currently US Office Actions and EP Examination Reports). Pick a type manually if you know it, or leave it un-analysed for now.",
			},
			422,
		)

	const schema = schemaFor(resolvedType)
	if (!schema)
		return c.json(
			{ error: `No extraction schema for type: ${resolvedType}` },
			400,
		)

	const systemStr = await buildExtractPatPrompt(settings)
	const result = streamText({
		model,
		system: systemStr,
		output: Output.object({ schema }),
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: schema.description ?? "" },
					{ type: "file", data: fileData, mediaType: "application/pdf" },
				],
			},
		],
	})

	return stream(c, async (s) => {
		await s.writeln(JSON.stringify({ type: "meta", assetType: resolvedType }))
		let last: Record<string, unknown> = {}
		try {
			for await (const partial of result.partialOutputStream) {
				last = (partial ?? {}) as Record<string, unknown>
				await s.writeln(JSON.stringify({ type: "partial", object: last }))
			}
		} catch (err) {
			await s.writeln(
				JSON.stringify({
					type: "error",
					message: err instanceof Error ? err.message : "Extraction failed.",
				}),
			)
			return
		}

		const now = new Date().toISOString()
		const record: AnalysisRecord = {
			filename: basename(filePath),
			assetType: resolvedType,
			details: mergeExtracted(resolvedType, last),
			locations: extractLocationMap(last),
			extractedAt: now,
			updatedAt: now,
		}
		await writeAnalysis(dirname(filePath), record)
		await s.writeln(JSON.stringify({ type: "done", record }))
	})
})
