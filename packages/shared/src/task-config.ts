import type { AssetType } from "./asset-config"

export const TASK_CONFIGS = [
	{
		id: "us-non-final-oa-response" as const,
		label: "US Non-Final OA Response",
		description: "Response to a USPTO Non-Final Office Action",
		allowedAssetTypes: [
			"us-office-action",
			"us-prior-art-reference",
			"us-application",
			"us-amended-claims",
			"us-response",
		] as AssetType[],
		aiContext:
			"This task is a response to a US Non-Final Office Action under 37 CFR 1.111. The goal is to overcome each ground of rejection while maintaining maximum claim scope.",
	},
	{
		id: "us-final-oa-response" as const,
		label: "US Final OA Response",
		description: "Response to a USPTO Final Office Action",
		allowedAssetTypes: [
			"us-office-action",
			"us-prior-art-reference",
			"us-application",
			"us-amended-claims",
			"us-response",
		] as AssetType[],
		aiContext:
			"This task is a response to a US Final Office Action under 37 CFR 1.116. Amendments must place the application in condition for allowance or clearly distinguish over the prior art of record.",
	},
	{
		id: "ep-art94-response" as const,
		label: "EP Art 94(3) Response",
		description: "Response to an EPO Article 94(3) Examination Report",
		allowedAssetTypes: [
			"ep-examination-report",
			"ep-prior-art-reference",
			"ep-application",
			"ep-amended-claims",
			"ep-response",
		] as AssetType[],
		aiContext:
			"This task is a response to a European Patent Office examination report under Article 94(3) EPC. The goal is to overcome objections under Articles 52–57 EPC, ensuring novelty, inventive step, and compliance with Rule 42 EPC.",
	},
]

export type TaskType = (typeof TASK_CONFIGS)[number]["id"]
