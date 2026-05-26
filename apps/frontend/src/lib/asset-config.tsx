import type { AssetKind, AssetType } from "@patrickos/db"
import {
	BookOpen,
	Gavel,
	Globe,
	ListChecks,
	type LucideIcon,
	Reply,
} from "lucide-react"
import type { ApiAsset } from "@/lib/api"
import { cn } from "@/lib/utils"

// ─── Field definition ─────────────────────────────────────────────────────────

export type FieldDef = {
	key: string
	label: string
	multiline?: boolean // plain textarea
	complex?: boolean // arrays/objects → JSON textarea
	dateField?: boolean // date input (YYYY-MM-DD)
}

// ─── Asset config ─────────────────────────────────────────────────────────────

export interface AssetConfig {
	id: AssetType
	kind: AssetKind
	groupLabel: string // sidebar group heading e.g. "Office Actions"
	typeLabel: string // dialog/dropdown label e.g. "USPTO Office Action"
	icon: LucideIcon
	color: string
	fields?: FieldDef[] // source types only — drives the extraction form
}

export const ASSET_CONFIGS: AssetConfig[] = [
	{
		id: "office-action",
		kind: "source",
		groupLabel: "Office Actions",
		typeLabel: "USPTO Office Action",
		icon: Gavel,
		color: "text-red-500",
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
		],
	},
	{
		id: "epo-examination-report",
		kind: "source",
		groupLabel: "EPO Examination Reports",
		typeLabel: "EPO Examination Report",
		icon: Globe,
		color: "text-blue-400",
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
		],
	},
	{
		id: "patent-spec",
		kind: "artifact",
		groupLabel: "Patent Specifications",
		typeLabel: "Patent Specification",
		icon: BookOpen,
		color: "text-blue-500",
	},
	{
		id: "claims-draft",
		kind: "artifact",
		groupLabel: "Claims Drafts",
		typeLabel: "Claims Draft",
		icon: ListChecks,
		color: "text-green-500",
	},
	{
		id: "response-draft",
		kind: "artifact",
		groupLabel: "Response Drafts",
		typeLabel: "Response Draft",
		icon: Reply,
		color: "text-violet-500",
	},
]

const KIND_LABELS: Record<AssetKind, string> = {
	source: "Sources",
	artifact: "Artifacts",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAssetConfig(id: AssetType): AssetConfig | undefined {
	return ASSET_CONFIGS.find((c) => c.id === id)
}

export function groupAssetsByKindAndType(assets: ApiAsset[]) {
	const result: {
		kind: AssetKind
		label: string
		types: {
			type: AssetType
			label: string
			icon: LucideIcon
			color: string
			assets: ApiAsset[]
		}[]
	}[] = []

	for (const kind of ["source", "artifact"] as AssetKind[]) {
		const types: {
			type: AssetType
			label: string
			icon: LucideIcon
			color: string
			assets: ApiAsset[]
		}[] = []
		for (const config of ASSET_CONFIGS.filter((c) => c.kind === kind)) {
			const typeAssets = assets
				.filter((a) => a.type === config.id)
				.sort((a, b) => a.date.localeCompare(b.date))
			if (typeAssets.length > 0)
				types.push({
					type: config.id,
					label: config.groupLabel,
					icon: config.icon,
					color: config.color,
					assets: typeAssets,
				})
		}
		result.push({ kind, label: KIND_LABELS[kind], types })
	}
	return result
}

export function AssetTypeIcon({
	type,
	size = 13,
}: {
	type: AssetType
	size?: number
}) {
	const config = getAssetConfig(type)
	if (!config) return null
	return <config.icon size={size} className={cn("shrink-0", config.color)} />
}

// ─── Source field helpers ─────────────────────────────────────────────────────

/** Empty defaults for all fields in a source type's schema. */
export function emptyDetails(type: string): Record<string, unknown> {
	const fields = getAssetConfig(type as AssetType)?.fields
	if (!fields) return {}
	return Object.fromEntries(fields.map((f) => [f.key, f.complex ? [] : ""]))
}

/** Merge AI extraction result into schema defaults, preserving field order. */
export function mergeExtracted(
	type: string,
	extracted: Record<string, unknown>,
): Record<string, unknown> {
	return { ...emptyDetails(type), ...extracted }
}
