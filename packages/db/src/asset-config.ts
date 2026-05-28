export type FieldDef = {
	key: string
	label: string
	multiline?: boolean
	complex?: boolean
	dateField?: boolean
}

export const ASSET_CONFIGS = [
	{
		id: "office-action" as const,
		kind: "source" as const,
		groupLabel: "US OA",
		typeLabel: "USPTO Office Action",
		fields: [
			{ key: "title", label: "Title" },
			{ key: "date", label: "Mailing Date", dateField: true },
			{ key: "notes", label: "Notes", multiline: true },
			{ key: "applicationNumber", label: "Application Number" },
			{ key: "filingDate", label: "Filing Date", dateField: true },
			{ key: "examinerName", label: "Examiner Name" },
			{ key: "artUnit", label: "Art Unit" },
			{ key: "rejections", label: "Rejections", complex: true },
			{ key: "allowedClaims", label: "Allowed Claims", complex: true },
			{ key: "objections", label: "Objections", complex: true },
		] as FieldDef[],
	},
	{
		id: "epo-examination-report" as const,
		kind: "source" as const,
		groupLabel: "EPO Examination Reports",
		typeLabel: "EPO Examination Report",
		fields: [
			{ key: "title", label: "Title" },
			{ key: "date", label: "Report Date", dateField: true },
			{ key: "notes", label: "Notes", multiline: true },
			{ key: "applicationNumber", label: "Application Number" },
			{ key: "filingDate", label: "Filing Date", dateField: true },
			{ key: "examiningDivision", label: "Examining Division" },
			{ key: "objections", label: "Objections", complex: true },
			{
				key: "allowedSubjectMatter",
				label: "Allowed Subject Matter",
				complex: true,
			},
		] as FieldDef[],
	},
	{
		id: "patent-spec" as const,
		kind: "artifact" as const,
		groupLabel: "Patent Specifications",
		typeLabel: "Patent Specification",
	},
	{
		id: "claims-draft" as const,
		kind: "artifact" as const,
		groupLabel: "Claims",
		typeLabel: "Claims",
	},
	{
		id: "response-draft" as const,
		kind: "artifact" as const,
		groupLabel: "Response",
		typeLabel: "Response",
	},
]

export type AssetType = (typeof ASSET_CONFIGS)[number]["id"]
export type AssetKind = (typeof ASSET_CONFIGS)[number]["kind"]
export type SourceAssetType = Extract<
	(typeof ASSET_CONFIGS)[number],
	{ kind: "source" }
>["id"]

export function getAssetFields(id: AssetType): FieldDef[] {
	const config = ASSET_CONFIGS.find((c) => c.id === id)
	if (!config || !("fields" in config)) return []
	return (config as { fields: FieldDef[] }).fields
}

export function emptyDetails(type: string): Record<string, unknown> {
	return Object.fromEntries(
		getAssetFields(type as AssetType).map((f) => [f.key, f.complex ? [] : ""]),
	)
}

export function mergeExtracted(
	type: string,
	extracted: Record<string, unknown>,
): Record<string, unknown> {
	return { ...emptyDetails(type), ...extracted }
}
