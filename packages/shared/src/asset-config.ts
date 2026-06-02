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
	// Schemas are deliberately lean: only fields AgentPat can actually use to draft
	// a response. Bibliographic "window dressing" (examiner name, art unit, filing
	// date, assignee) is omitted on purpose.
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
					"Short descriptive title (e.g. 'Non-Final OA — App. 17/123,456')",
				),
				date: zExtractField(zDate(), "Mailing date of the office action"),
				applicationNumber: zExtractField(
					z.string().max(30),
					"Application number",
				),
				dueDate: zExtractField(
					zDate(),
					"Date the response is due (the shortened statutory period — usually 3 months from mailing, extendable to 6)",
				),
				rejections: zExtractField(
					z.array(z.string()),
					"One entry per rejection. For each: the statutory basis (§101/§102/§103/§112), the claims affected, the cited reference(s), and a concise summary of the examiner's reasoning",
				),
				objections: zExtractField(
					z.array(z.string()),
					"Objections to the claims, specification, or drawings (lesser issues, not full rejections)",
				),
				allowedClaims: zExtractField(
					z.array(z.string()),
					"Claims indicated as allowed or as containing allowable subject matter",
				),
				notes: zExtractField(
					zTextarea("Anything else relevant to drafting the response", 1000),
					"Notes",
				),
			})
			.describe(
				"Extract the prosecution-relevant content of this USPTO Office Action — what is needed to draft a response: the rejections and the examiner's reasoning, objections, allowed claims, and the response due date. For each field return { content, locations } where locations is an array of { page, zone }.",
			),
	},
	{
		id: "us-prior-art-reference" as const,
		kind: "source" as const,
		groupLabel: "Prior Art",
		typeLabel: "US Prior Art Reference",
		aiContext:
			"Prior art reference cited against the US application in support of rejections",
		schema: z
			.object({
				title: zExtractField(z.string().max(300), "Title of the reference"),
				publicationNumber: zExtractField(
					z.string().max(40),
					"Publication or patent number (e.g. US 9,876,543 B2)",
				),
				publicationDate: zExtractField(
					zDate(),
					"Publication date (relevant to §102 vs §103 and to priority)",
				),
				keyTeachings: zExtractField(
					zTextarea(
						"Concise summary of what this reference actually discloses — the problem it addresses, its core technical teaching, and the main embodiments. Note the most salient passages/figures. (Summarise the document on its own terms; do NOT speculate about which application claims it might be cited against — that comparison happens elsewhere.)",
						3000,
					),
					"Key teachings",
				),
				notes: zExtractField(zTextarea("Notes", 1000), "Notes"),
			})
			.describe(
				"Summarise this prior-art reference from the document alone: its identity, date, and what it teaches. For each field return { content, locations } where locations is an array of { page, zone }.",
			),
	},
	{
		id: "us-application" as const,
		kind: "source" as const,
		groupLabel: "Application",
		typeLabel: "US Patent Application",
		aiContext:
			"US patent application as filed, including specification and original claims",
		schema: z
			.object({
				title: zExtractField(z.string().max(200), "Title of the invention"),
				applicationNumber: zExtractField(
					z.string().max(30),
					"Application number",
				),
				independentClaims: zExtractField(
					z.array(z.string()),
					"The full text of each independent claim as currently pending",
				),
				keyFeatures: zExtractField(
					zTextarea(
						"The technical problem addressed and the inventive features/embodiments most useful for arguing patentability or supporting amendments — cite specification support (paragraph or figure references) where possible",
						3000,
					),
					"Key features and specification support",
				),
				notes: zExtractField(zTextarea("Notes", 1000), "Notes"),
			})
			.describe(
				"Extract what is needed to amend and argue the claims: the independent claims as pending, and the inventive features with their support in the specification. For each field return { content, locations } where locations is an array of { page, zone }.",
			),
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
					"Short descriptive title (e.g. 'Art 94(3) Communication — App. 20123456.7')",
				),
				date: zExtractField(zDate(), "Date of the communication"),
				applicationNumber: zExtractField(
					z.string().max(30),
					"Application number",
				),
				dueDate: zExtractField(
					zDate(),
					"Date the response is due (the period set in the communication)",
				),
				objections: zExtractField(
					z.array(z.string()),
					"One entry per objection. For each: the EPC article/rule (e.g. Art 54, Art 56, Art 84, Rule 137), the claims affected, the cited document(s), and a concise summary of the reasoning",
				),
				allowedSubjectMatter: zExtractField(
					z.array(z.string()),
					"Claims or subject matter the examiner considers allowable",
				),
				notes: zExtractField(
					zTextarea("Anything else relevant to drafting the response", 1000),
					"Notes",
				),
			})
			.describe(
				"Extract the prosecution-relevant content of this EPO examination report (Art 94(3) EPC) — what is needed to draft a response: the objections and reasoning, allowable subject matter, and the response due date. For each field return { content, locations } where locations is an array of { page, zone }.",
			),
	},
	{
		id: "ep-prior-art-reference" as const,
		kind: "source" as const,
		groupLabel: "EP Prior Art",
		typeLabel: "EP Prior Art Reference",
		aiContext:
			"Prior art reference cited against the EP application by the examining division",
		schema: z
			.object({
				title: zExtractField(z.string().max(300), "Title of the reference"),
				publicationNumber: zExtractField(
					z.string().max(40),
					"Publication or patent number (e.g. EP 1 234 567 A1)",
				),
				publicationDate: zExtractField(
					zDate(),
					"Publication date (relevant to Art 54(2)/(3) EPC and to priority)",
				),
				keyTeachings: zExtractField(
					zTextarea(
						"Concise summary of what this document actually discloses — the problem it addresses, its core technical teaching, and the main embodiments. Note the most salient passages/figures. (Summarise the document on its own terms; do NOT speculate about which application claims it might be cited against — that comparison happens elsewhere.)",
						3000,
					),
					"Key teachings",
				),
				notes: zExtractField(zTextarea("Notes", 1000), "Notes"),
			})
			.describe(
				"Summarise this prior-art document from the document alone: its identity, date, and what it teaches. For each field return { content, locations } where locations is an array of { page, zone }.",
			),
	},
	{
		id: "ep-application" as const,
		kind: "source" as const,
		groupLabel: "EP Application",
		typeLabel: "EP Patent Application",
		aiContext:
			"EP patent application as filed, including description and original claims",
		schema: z
			.object({
				title: zExtractField(z.string().max(200), "Title of the invention"),
				applicationNumber: zExtractField(
					z.string().max(30),
					"Application number",
				),
				independentClaims: zExtractField(
					z.array(z.string()),
					"The full text of each independent claim as currently pending",
				),
				keyFeatures: zExtractField(
					zTextarea(
						"The technical problem addressed and the inventive features/embodiments most useful for arguing inventive step or supporting amendments — cite description support (paragraph or figure references), bearing in mind Art 123(2) EPC added-matter constraints",
						3000,
					),
					"Key features and description support",
				),
				notes: zExtractField(zTextarea("Notes", 1000), "Notes"),
			})
			.describe(
				"Extract what is needed to amend and argue the claims: the independent claims as pending, and the inventive features with their support in the description (mindful of Art 123(2) EPC). For each field return { content, locations } where locations is an array of { page, zone }.",
			),
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
