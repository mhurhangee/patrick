// Unified field definitions for source document types.
// Title, Date, Notes are included in every schema at the same level as
// type-specific fields — AI extraction fills all of them; users can edit any.

export type FieldDef = {
	key: string
	label: string
	multiline?: boolean // plain textarea
	complex?: boolean // arrays/objects → JSON textarea
	dateField?: boolean // date input (YYYY-MM-DD)
}

export const SOURCE_SCHEMA: Record<string, FieldDef[]> = {
	"office-action": [
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
	],
	"epo-examination-report": [
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
	],
}

/** Empty defaults for all fields in a type's schema. */
export function emptyDetails(type: string): Record<string, unknown> {
	const schema = SOURCE_SCHEMA[type]
	if (!schema) return {}
	return Object.fromEntries(schema.map((f) => [f.key, f.complex ? [] : ""]))
}

/** Merge AI extraction result into schema defaults, preserving field order. */
export function mergeExtracted(
	type: string,
	extracted: Record<string, unknown>,
): Record<string, unknown> {
	return { ...emptyDetails(type), ...extracted }
}
