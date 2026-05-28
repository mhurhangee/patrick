import { z } from "zod"

export const zDate = () =>
	z.string().regex(/^\d{4}-\d{2}-\d{2}$|^$/, "Use YYYY-MM-DD format")

// Marks a string field as a textarea in the form renderer.
// Use instead of z.string() for multi-line text fields.
export const zTextarea = (description: string, maxLength = 2000) =>
	z.string().max(maxLength).describe(`[textarea]${description}`)

export type FieldMeta = {
	key: string
	label: string
	inputType: "input" | "textarea" | "date" | "list"
}

function getInputType(
	key: string,
	shape: z.ZodTypeAny,
): FieldMeta["inputType"] {
	if (shape instanceof z.ZodArray) return "list"
	if (key.toLowerCase().includes("date")) return "date"
	if (shape.description?.startsWith("[textarea]")) return "textarea"
	return "input"
}

export const ASSET_CONFIGS = [
	// ─── US Sources ──────────────────────────────────────────────────────────────
	{
		id: "us-office-action" as const,
		kind: "source" as const,
		groupLabel: "US OA",
		typeLabel: "USPTO Office Action",
		aiContext:
			"USPTO Office Action containing grounds of rejection (§102, §103, §101, §112), objections, and any allowed claims",
		schema: z
			.object({
				title: z.string().max(200).describe("Title"),
				date: zDate().describe("Mailing date"),
				applicationNumber: z.string().max(30).describe("Application number"),
				filingDate: zDate().describe("Filing date"),
				examinerName: z.string().max(100).describe("Examiner name"),
				artUnit: z.string().max(10).describe("Art unit"),
				rejections: z
					.array(z.string())
					.describe(
						"Each rejection: statutory basis (§101/102/103/112), claims affected, cited references",
					),
				allowedClaims: z
					.array(z.string())
					.describe("Claim numbers indicated as allowed"),
				objections: z
					.array(z.string())
					.describe("Non-rejection objections to drawings or specification"),
				notes: zTextarea("Notes", 1000),
			})
			.describe(
				"Extract structured data from this USPTO Office Action. Return empty strings for absent text fields and empty arrays for absent list fields.",
			),
	},
	{
		id: "us-prior-art-reference" as const,
		kind: "source" as const,
		groupLabel: "US Prior Art",
		typeLabel: "US Prior Art Reference",
		aiContext:
			"Prior art reference cited against the US application in support of rejections",
		schema: z.object({
			title: z.string().max(200).describe("Title"),
			publicationNumber: z.string().max(30).describe("Publication number"),
			publicationDate: zDate().describe("Publication date"),
			authors: z.string().max(200).describe("Authors / inventors"),
			abstract: zTextarea("Abstract"),
			notes: zTextarea("Notes", 1000),
		}),
	},
	{
		id: "us-application" as const,
		kind: "source" as const,
		groupLabel: "US Application",
		typeLabel: "US Patent Application",
		aiContext:
			"US patent application as filed, including specification and original claims",
		schema: z.object({
			title: z.string().max(200).describe("Invention title"),
			applicationNumber: z.string().max(30).describe("Application number"),
			filingDate: zDate().describe("Filing date"),
			inventors: z.string().max(200).describe("Inventors"),
			assignee: z.string().max(200).describe("Assignee"),
			notes: zTextarea("Notes", 1000),
		}),
	},
	// ─── EP Sources ───────────────────────────────────────────────────────────────
	{
		id: "ep-examination-report" as const,
		kind: "source" as const,
		groupLabel: "EP Exam Report",
		typeLabel: "EPO Examination Report",
		aiContext:
			"EPO examination report under Article 94(3) EPC containing objections, prior art citations, and any allowable subject matter",
		schema: z
			.object({
				title: z.string().max(200).describe("Title"),
				date: zDate().describe("Communication date"),
				applicationNumber: z.string().max(30).describe("Application number"),
				filingDate: zDate().describe("Filing date"),
				examiningDivision: z.string().max(100).describe("Examining division"),
				objections: z
					.array(z.string())
					.describe(
						"Each objection: EPC article/rule raised, claims affected, cited documents, grounds",
					),
				allowedSubjectMatter: z
					.array(z.string())
					.describe("Claims or subject matter considered allowable"),
				notes: zTextarea("Notes", 1000),
			})
			.describe(
				"Extract structured data from this EPO examination report. Return empty strings for absent text fields and empty arrays for absent list fields.",
			),
	},
	{
		id: "ep-prior-art-reference" as const,
		kind: "source" as const,
		groupLabel: "EP Prior Art",
		typeLabel: "EP Prior Art Reference",
		aiContext:
			"Prior art reference cited against the EP application by the examining division",
		schema: z.object({
			title: z.string().max(200).describe("Title"),
			publicationNumber: z.string().max(30).describe("Publication number"),
			publicationDate: zDate().describe("Publication date"),
			authors: z.string().max(200).describe("Authors / inventors"),
			abstract: zTextarea("Abstract"),
			notes: zTextarea("Notes", 1000),
		}),
	},
	{
		id: "ep-application" as const,
		kind: "source" as const,
		groupLabel: "EP Application",
		typeLabel: "EP Patent Application",
		aiContext:
			"EP patent application as filed, including description and original claims",
		schema: z.object({
			title: z.string().max(200).describe("Invention title"),
			applicationNumber: z.string().max(30).describe("Application number"),
			filingDate: zDate().describe("Filing date"),
			inventors: z.string().max(200).describe("Inventors"),
			applicant: z.string().max(200).describe("Applicant"),
			notes: zTextarea("Notes", 1000),
		}),
	},
	// ─── US Artifacts ─────────────────────────────────────────────────────────────
	{
		id: "us-amended-claims" as const,
		kind: "artifact" as const,
		groupLabel: "US Claims",
		typeLabel: "US Amended Claims",
		aiContext:
			"Proposed amended claim set for the US application in response to the office action",
	},
	{
		id: "us-response" as const,
		kind: "artifact" as const,
		groupLabel: "US Response",
		typeLabel: "US Office Action Response",
		aiContext:
			"Draft response to the USPTO office action, including amendments and arguments/remarks under 37 CFR 1.111 or 1.116",
	},
	// ─── EP Artifacts ─────────────────────────────────────────────────────────────
	{
		id: "ep-amended-claims" as const,
		kind: "artifact" as const,
		groupLabel: "EP Claims",
		typeLabel: "EP Amended Claims",
		aiContext:
			"Proposed amended claim set for the EP application in response to the examination report",
	},
	{
		id: "ep-response" as const,
		kind: "artifact" as const,
		groupLabel: "EP Response",
		typeLabel: "EP Examination Response",
		aiContext:
			"Draft response to the EPO examination report, including amended claims and observations/arguments",
	},
]

export type AssetType = (typeof ASSET_CONFIGS)[number]["id"]
export type AssetKind = (typeof ASSET_CONFIGS)[number]["kind"]
export type SourceAssetType = Extract<
	(typeof ASSET_CONFIGS)[number],
	{ kind: "source" }
>["id"]

function getConfigWithSchema(assetType: string) {
	const config = ASSET_CONFIGS.find((c) => c.id === assetType)
	if (!config || !("schema" in config)) return null
	return config as typeof config & { schema: z.ZodObject<z.ZodRawShape> }
}

export function getFormFields(assetType: string): FieldMeta[] {
	const config = getConfigWithSchema(assetType)
	if (!config) return []
	return Object.entries(config.schema.shape).map(([key, shape]) => ({
		key,
		label: ((shape as z.ZodTypeAny).description ?? key).replace(
			/^\[textarea\]/,
			"",
		),
		inputType: getInputType(key, shape as z.ZodTypeAny),
	}))
}

export function isExtractable(assetType: string): boolean {
	const config = getConfigWithSchema(assetType)
	return !!config?.schema.description
}

export function emptyDetails(assetType: string): Record<string, unknown> {
	const config = getConfigWithSchema(assetType)
	if (!config) return {}
	return Object.fromEntries(
		Object.entries(config.schema.shape).map(([key, shape]) => [
			key,
			(shape as z.ZodTypeAny) instanceof z.ZodArray ? [] : "",
		]),
	)
}

export function mergeExtracted(
	assetType: string,
	extracted: Record<string, unknown>,
): Record<string, unknown> {
	return { ...emptyDetails(assetType), ...extracted }
}
