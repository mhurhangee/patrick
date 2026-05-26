import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { assets, eq, settings } from "@patrickos/db"
import { createGateway, generateObject } from "ai"
import { Hono } from "hono"
import { z } from "zod"
import { db } from "../lib/db"

export const extractpatRouter = new Hono()

// ─── Model factory (shared with askpat) ──────────────────────────────────────

function createModel(provider: string, apiKey: string, modelId: string) {
	const key = apiKey.trim()
	if (provider === "openai") return createOpenAI({ apiKey: key })(modelId)
	if (provider === "gateway") return createGateway({ apiKey: key })(modelId)
	return createAnthropic({ apiKey: key })(modelId)
}

// ─── Per-type extraction schemas ──────────────────────────────────────────────

const officeActionSchema = z.object({
	title: z
		.string()
		.describe("Subject line or brief title of the office action"),
	date: z.string().describe("Date the office action was mailed (YYYY-MM-DD)"),
	notes: z.string().describe("Notable context, urgency, or overall summary"),
	applicationNumber: z.string().describe("Patent application number"),
	filingDate: z.string().describe("Application filing date (YYYY-MM-DD)"),
	examinerName: z.string().describe("Examiner full name"),
	artUnit: z.string().describe("USPTO Art Unit number"),
	rejections: z
		.array(
			z.object({
				type: z
					.enum(["101", "102", "103", "112", "other"])
					.describe("Rejection statute"),
				claimsRejected: z
					.array(z.string())
					.describe("Claim numbers rejected under this ground"),
				citedReferences: z
					.array(z.string())
					.describe(
						"Prior art references cited (patent numbers or author names)",
					),
				grounds: z
					.string()
					.describe("Brief summary of the rejection rationale"),
			}),
		)
		.describe("All rejections in the office action"),
	allowedClaims: z
		.array(z.string())
		.describe("Claim numbers that are allowed, if any"),
	objections: z
		.array(z.string())
		.describe(
			"Non-rejection objections raised (e.g. to drawings or specification)",
		),
})

const epoExaminationReportSchema = z.object({
	title: z
		.string()
		.describe("Subject line or brief title of the examination report"),
	date: z.string().describe("Date of the examination report (YYYY-MM-DD)"),
	notes: z.string().describe("Notable context, urgency, or overall summary"),
	applicationNumber: z.string().describe("European patent application number"),
	filingDate: z.string().describe("Application filing date (YYYY-MM-DD)"),
	examiningDivision: z
		.string()
		.describe("EPO examining division or primary examiner name"),
	objections: z
		.array(
			z.object({
				article: z
					.string()
					.describe(
						"EPC article or rule raised (e.g. Art. 56, Art. 84, Rule 43(2))",
					),
				claimsAffected: z
					.array(z.string())
					.describe("Claims affected by this objection"),
				citedDocuments: z
					.array(z.string())
					.describe("Documents cited in support of this objection"),
				grounds: z
					.string()
					.describe("Brief summary of the objection rationale"),
			}),
		)
		.describe("All objections raised in the examination report"),
	allowedSubjectMatter: z
		.array(z.string())
		.describe("Claims or subject matter considered allowable, if any"),
})

const SCHEMAS = {
	"office-action": officeActionSchema,
	"epo-examination-report": epoExaminationReportSchema,
} as const

type ExtractableType = keyof typeof SCHEMAS

const EXTRACTION_PROMPTS: Record<ExtractableType, string> = {
	"office-action":
		"Extract structured data from this USPTO Office Action. Use empty strings for text fields not present. Use empty arrays where no items are found.",
	"epo-examination-report":
		"Extract structured data from this EPO examination report or communication. Use empty strings for text fields not present. Use empty arrays where no items are found.",
}

async function loadSystemPrompt(): Promise<string | undefined> {
	const [row] = await db.select().from(settings).where(eq(settings.id, "local"))
	return row?.promptExtractpat || undefined
}

// ─── Route ────────────────────────────────────────────────────────────────────

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

	// Fetch asset including the raw PDF blob
	const [asset] = await db.select().from(assets).where(eq(assets.id, assetId))

	if (!asset) return c.json({ error: "Asset not found" }, 404)
	if (!asset.data) return c.json({ error: "Asset has no file data" }, 400)
	if (!(asset.type in SCHEMAS))
		return c.json(
			{ error: `No extraction schema for type: ${asset.type}` },
			400,
		)

	const assetType = asset.type as ExtractableType
	const schema = SCHEMAS[assetType]
	const prompt = EXTRACTION_PROMPTS[assetType]
	const system = await loadSystemPrompt()
	const model = createModel(provider, apiKey, modelId)

	const { object } = await generateObject({
		model,
		schema,
		system,
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: prompt },
					{
						type: "file",
						data: asset.data as Buffer,
						mediaType: "application/pdf",
					},
				],
			},
		],
	})

	return c.json({ extracted: object, assetType })
})
