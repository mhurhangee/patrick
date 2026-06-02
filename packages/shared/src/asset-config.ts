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

// ─── Extraction field wrapper ─────────────────────────────────────────────────

const zFieldLocation = z.object({
	page: z.number().int().min(1),
	zone: z.enum(["top", "upper-centre", "centre", "lower-centre", "bottom"]),
})

export type FieldLocation = z.infer<typeof zFieldLocation>
export type FieldZone = FieldLocation["zone"]

// Wraps any field with { content, locations } for AI extraction.
// Only used in extractable schemas — non-extractable schemas stay as plain fields.
export function zExtractField<T extends z.ZodTypeAny>(
	inner: T,
	description: string,
) {
	return z
		.object({
			content: inner,
			locations: z.array(zFieldLocation).optional(),
		})
		.describe(description)
}

// If shape is a { content, locations } extraction wrapper, return the inner content shape.
function getFieldShape(shape: z.ZodTypeAny): z.ZodTypeAny {
	if (
		shape instanceof z.ZodObject &&
		"content" in shape.shape &&
		"locations" in shape.shape
	) {
		return shape.shape.content as z.ZodTypeAny
	}
	return shape
}

function getInputType(
	key: string,
	shape: z.ZodTypeAny,
): FieldMeta["inputType"] {
	const inner = getFieldShape(shape)
	if (inner instanceof z.ZodArray) return "list"
	if (key.toLowerCase().includes("date")) return "date"
	if (inner.description?.startsWith("[textarea]")) return "textarea"
	return "input"
}

export const ASSET_CONFIGS = [
	// ─── US Sources ──────────────────────────────────────────────────────────────
	{
		id: "us-office-action" as const,
		kind: "source" as const,
		groupLabel: "OA",
		typeLabel: "USPTO Office Action",
		aiContext:
			"USPTO Office Action containing grounds of rejection (§102, §103, §101, §112), objections, and any allowed claims",
		schema: z
			.object({
				title: zExtractField(
					z.string().max(200),
					"Descriptive title (e.g. 'Office Action — App. 12/664,771 (Brown et al.)')",
				),
				date: zExtractField(zDate(), "Mailing date"),
				applicationNumber: zExtractField(
					z.string().max(30),
					"Application number",
				),
				filingDate: zExtractField(zDate(), "Filing date"),
				examinerName: zExtractField(z.string().max(100), "Examiner name"),
				artUnit: zExtractField(z.string().max(10), "Art unit"),
				rejections: zExtractField(
					z.array(z.string()),
					"Each rejection: statutory basis (§101/102/103/112), claims affected, cited references",
				),
				allowedClaims: zExtractField(
					z.array(z.string()),
					"Claim numbers indicated as allowed",
				),
				objections: zExtractField(
					z.array(z.string()),
					"Non-rejection objections to drawings or specification",
				),
				notes: zExtractField(zTextarea("Notes", 1000), "Notes"),
			})
			.describe(
				"Extract structured data from this USPTO Office Action. For each field return { content, locations } where locations is an array of { page, zone } indicating where the value was found.",
			),
	},
	{
		id: "us-prior-art-reference" as const,
		kind: "source" as const,
		groupLabel: "Prior Art",
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
		groupLabel: "Application",
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
				title: zExtractField(
					z.string().max(200),
					"Descriptive title (e.g. 'EPO Examination Report — App. 20123456.7 (Smith et al.)')",
				),
				date: zExtractField(zDate(), "Communication date"),
				applicationNumber: zExtractField(
					z.string().max(30),
					"Application number",
				),
				filingDate: zExtractField(zDate(), "Filing date"),
				examiningDivision: zExtractField(
					z.string().max(100),
					"Examining division",
				),
				objections: zExtractField(
					z.array(z.string()),
					"Each objection: EPC article/rule raised, claims affected, cited documents, grounds",
				),
				allowedSubjectMatter: zExtractField(
					z.array(z.string()),
					"Claims or subject matter considered allowable",
				),
				notes: zExtractField(zTextarea("Notes", 1000), "Notes"),
			})
			.describe(
				"Extract structured data from this EPO examination report. For each field return { content, locations } where locations is an array of { page, zone } indicating where the value was found.",
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
		groupLabel: "Claims",
		typeLabel: "US Amended Claims",
		aiContext:
			"Proposed amended claim set for the US application in response to the office action",
	},
	{
		id: "us-response" as const,
		kind: "artifact" as const,
		groupLabel: "Response",
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
	return Object.entries(config.schema.shape)
		.filter(([key]) => !key.startsWith("_"))
		.map(([key, shape]) => ({
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
		Object.entries(config.schema.shape)
			.filter(([key]) => !key.startsWith("_"))
			.map(([key, shape]) => {
				const inner = getFieldShape(shape as z.ZodTypeAny)
				return [key, inner instanceof z.ZodArray ? [] : ""]
			}),
	)
}

// Unwrap { content, locations } extraction wrappers and merge into flat details.
export function mergeExtracted(
	assetType: string,
	extracted: Record<string, unknown>,
): Record<string, unknown> {
	const clean = Object.fromEntries(
		Object.entries(extracted)
			.filter(([k]) => !k.startsWith("_"))
			.map(([k, v]) => {
				if (v && typeof v === "object" && !Array.isArray(v) && "content" in v) {
					return [k, (v as { content: unknown }).content]
				}
				return [k, v]
			}),
	)
	return { ...emptyDetails(assetType), ...clean }
}

// Persisted ExtractPat result for one source file → analysis/{filename}.json
export type AnalysisRecord = {
	/** Source filename this analysis belongs to (e.g. "office-action.pdf"). */
	filename: string
	/** Resolved source asset type (chosen by the user or by auto-classification). */
	assetType: string
	/** Flat, editable field values (content unwrapped from extraction wrappers). */
	details: Record<string, unknown>
	/** Per-field page locations, for highlighting in the document viewer. */
	locations: Record<string, FieldLocation[]>
	/** ISO timestamp of the last ExtractPat run. */
	extractedAt: string
	/** ISO timestamp of the last edit/save. */
	updatedAt: string
}

// Summary entry for listing which sources have been analysed.
export type AnalysisSummary = {
	filename: string
	assetType: string
	updatedAt: string
}

// Pull location arrays out of { content, locations } wrapped fields into a flat map.
export function extractLocationMap(
	extracted: Record<string, unknown>,
): Record<string, FieldLocation[]> {
	const map: Record<string, FieldLocation[]> = {}
	for (const [k, v] of Object.entries(extracted)) {
		if (k.startsWith("_")) continue
		if (v && typeof v === "object" && !Array.isArray(v) && "locations" in v) {
			const locs = (v as { locations?: unknown }).locations
			if (Array.isArray(locs) && locs.length > 0) {
				map[k] = locs as FieldLocation[]
			}
		}
	}
	return map
}
