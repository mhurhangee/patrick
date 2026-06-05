import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import {
	ASSET_CONFIGS,
	CATALOG,
	type ExtractionRecord,
	type ExtractionSummary,
	fill,
	type Settings,
	TASK_CONFIGS,
	type TaskType,
	type TokenId,
} from "@patrickos/shared"
import { type Tool, tool } from "ai"
import { z } from "zod"
import { fetchPatent } from "../epo-ops"
import { readExtraction, readNote } from "../fs"

// Everything a resolver / tool-builder might need, assembled per request. Fields
// are per-surface — a resolver returns null (or a tool builder returns null)
// when the context it needs is absent, so the same ctx shape serves every
// surface. `settings` is the only constant.
export type ResolveCtx = {
	settings: Settings
	// AgentPat
	taskPath?: string
	taskType?: TaskType
	openFilePaths?: string[]
	extractedSources?: ExtractionSummary[]
	/** Basenames of excluded files — for the prompt text. */
	excludedFiles?: string[]
	/** Full paths of excluded files — for gating the readFile tool. */
	excludedPaths?: Set<string>
	// Editor surfaces (DraftPat / NotePat)
	/** Document/asset type id open in the editor (DraftPat), or "note". */
	assetType?: string
	/** Filename of the source a note is attached to (NotePat). */
	currentSourceName?: string
}

type ContextResolver = {
	kind: "context" | "scope"
	// May be async — some resolvers read files (notes, extractions).
	resolve: (ctx: ResolveCtx) => string | null | Promise<string | null>
}
type ToolResolver = {
	kind: "tool"
	// Returns null to omit the tool (e.g. fetchPatent without EPO keys) — render
	// then drops both the tool and its blurb.
	build: (ctx: ResolveCtx) => Tool | null
}
export type Resolver = ContextResolver | ToolResolver

const w = (id: TokenId) => CATALOG[id].wrapper ?? ""
const basename = (p: string) => p.split("/").at(-1) ?? p

// Render an extraction record's flat fields as readable bullet lines.
function formatExtraction(rec: ExtractionRecord): string {
	const lines = Object.entries(rec.details)
		.filter(
			([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
		)
		.map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join("; ") : String(v)}`)
	return `## ${rec.filename} (${rec.assetType})\n${lines.join("\n")}`
}

// Pull plain text out of a stored Plate note (JSON value) — no Plate on the
// server, so walk the node tree and collect text, one top-level block per line.
function plateToText(raw: string): string {
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		return ""
	}
	if (!Array.isArray(value)) return ""
	const blockText = (node: unknown): string => {
		const n = node as { text?: string; children?: unknown[] }
		if (typeof n.text === "string") return n.text
		if (Array.isArray(n.children)) return n.children.map(blockText).join("")
		return ""
	}
	return (value as unknown[]).map(blockText).join("\n").trim()
}

// ─── Resolvers ──────────────────────────────────────────────────────────────
// One per catalog token. Context resolvers return text or null (null = omit the
// block). Tool resolvers build the AI SDK tool, reading the model-facing
// description from the catalog (single source of truth).

export const RESOLVERS: Record<TokenId, Resolver> = {
	ATTORNEY: {
		kind: "context",
		resolve: ({ settings }) => {
			const about = settings.profile.about.trim()
			return about ? fill(w("ATTORNEY"), { body: about }) : null
		},
	},

	PRACTICECONTEXT: {
		kind: "context",
		resolve: ({ settings }) =>
			settings.prompts.context
				? fill(w("PRACTICECONTEXT"), { body: settings.prompts.context })
				: null,
	},

	TASK: {
		kind: "context",
		resolve: ({ taskPath, taskType }) => {
			if (!taskPath) return null
			const config = taskType
				? TASK_CONFIGS.find((p) => p.id === taskType)
				: undefined
			const typeLines = config
				? `\nTask type: ${config.label}\n${config.aiContext}`
				: ""
			return fill(w("TASK"), {
				folder: basename(taskPath),
				path: taskPath,
				typeLines,
			})
		},
	},

	OPENSOURCES: {
		kind: "scope",
		resolve: ({ openFilePaths }) => {
			if (!openFilePaths?.length) return null
			const list = openFilePaths.map((p) => `- ${basename(p)}`).join("\n")
			return fill(w("OPENSOURCES"), { list })
		},
	},

	EXISTINGEXTRACTIONS: {
		kind: "context",
		resolve: ({ extractedSources }) => {
			if (!extractedSources?.length) return null
			const list = extractedSources
				.map(
					(a) =>
						`- ${a.filename} (${a.assetType}) → derivations/extractions/${a.filename}.json`,
				)
				.join("\n")
			return fill(w("EXISTINGEXTRACTIONS"), { list })
		},
	},

	EXCLUDED: {
		kind: "context",
		resolve: ({ excludedFiles }) => {
			if (!excludedFiles?.length) return null
			const list = excludedFiles.map((f) => `- ${f}`).join("\n")
			return fill(w("EXCLUDED"), { list })
		},
	},

	EXTRACTEDDATA: {
		kind: "context",
		resolve: async ({ taskPath, openFilePaths }) => {
			if (!taskPath || !openFilePaths?.length) return null
			const blocks: string[] = []
			for (const p of openFilePaths) {
				const rec = await readExtraction(taskPath, basename(p))
				if (rec) blocks.push(formatExtraction(rec))
			}
			return blocks.length
				? fill(w("EXTRACTEDDATA"), { list: blocks.join("\n\n") })
				: null
		},
	},

	NOTES: {
		kind: "context",
		resolve: async ({ taskPath, openFilePaths }) => {
			if (!taskPath || !openFilePaths?.length) return null
			const blocks: string[] = []
			for (const p of openFilePaths) {
				const raw = await readNote(taskPath, basename(p))
				const text = raw ? plateToText(raw) : ""
				if (text) blocks.push(`## ${basename(p)}\n${text}`)
			}
			return blocks.length
				? fill(w("NOTES"), { list: blocks.join("\n\n") })
				: null
		},
	},

	DOCTYPE: {
		kind: "context",
		resolve: ({ assetType }) => {
			const aiContext = assetType
				? ASSET_CONFIGS.find((c) => c.id === assetType)?.aiContext
				: undefined
			return aiContext ? fill(w("DOCTYPE"), { aiContext }) : null
		},
	},

	LOCATIONINSTRUCTION: {
		kind: "context",
		// Pure boilerplate — the whole block lives in the catalog wrapper.
		resolve: () => w("LOCATIONINSTRUCTION"),
	},

	CURRENTSOURCE: {
		kind: "scope",
		resolve: ({ currentSourceName }) =>
			currentSourceName
				? fill(w("CURRENTSOURCE"), { filename: currentSourceName })
				: null,
	},

	// ─── Tools ──────────────────────────────────────────────────────────────────
	EXTRACTSOURCE: {
		kind: "tool",
		// No execute — a client-side confirmation tool. The loop stops, the call is
		// forwarded to the client which runs ExtractPat and feeds the result back.
		build: () =>
			tool({
				description: CATALOG.EXTRACTSOURCE.description,
				inputSchema: z.object({
					filename: z
						.string()
						.describe(
							"The source filename to extract from, e.g. 'office-action.pdf'",
						),
					assetType: z
						.string()
						.optional()
						.describe(
							"Document type id if known (e.g. 'us-office-action', 'ep-examination-report'); omit to auto-detect",
						),
				}),
			}),
	},

	LISTDIRECTORY: {
		kind: "tool",
		build: ({ taskPath }) =>
			taskPath == null
				? null
				: tool({
						description: CATALOG.LISTDIRECTORY.description,
						inputSchema: z.object({
							path: z
								.string()
								.describe(
									"Absolute path to list. Use the task path to list the root.",
								),
						}),
						execute: async ({ path: dirPath }) => {
							const target = dirPath || taskPath
							if (!target.startsWith(taskPath))
								return { error: "Path outside task folder" }
							try {
								const entries = await readdir(target, { withFileTypes: true })
								return entries.map((e) => ({
									name: e.name,
									type: e.isDirectory() ? "directory" : "file",
									path: join(target, e.name),
								}))
							} catch {
								return { error: `Could not list: ${target}` }
							}
						},
					}),
	},

	READFILE: {
		kind: "tool",
		build: ({ taskPath, excludedPaths }) =>
			taskPath == null
				? null
				: tool({
						description: CATALOG.READFILE.description,
						inputSchema: z.object({
							path: z.string().describe("Absolute path to the file"),
						}),
						execute: async ({ path: filePath }) => {
							if (!filePath.startsWith(taskPath))
								return { error: "Path outside task folder" }
							if (excludedPaths?.has(filePath))
								return {
									error:
										"This document is excluded from AgentPat by the attorney. Do not read or use it.",
								}
							const ext = extname(filePath).toLowerCase()
							try {
								if (ext === ".pdf") {
									const s = await stat(filePath)
									return {
										note: "PDF file — open it in the editor to include it in AI context",
										size: s.size,
									}
								}
								const content = await readFile(filePath, "utf8")
								return { content: content.slice(0, 20000) } // cap at 20k chars
							} catch {
								return { error: `Could not read: ${filePath}` }
							}
						},
					}),
	},

	FETCHPATENT: {
		kind: "tool",
		build: ({ settings }) => {
			const { epoOpsKey, epoOpsSecret } = settings.integrations
			if (!epoOpsKey || !epoOpsSecret) return null
			return tool({
				description: CATALOG.FETCHPATENT.description,
				inputSchema: z.object({
					publicationNumber: z.string().describe("Patent publication number"),
				}),
				execute: async ({ publicationNumber }) => {
					try {
						return await fetchPatent(publicationNumber, {
							consumerKey: epoOpsKey,
							consumerSecret: epoOpsSecret,
						})
					} catch (err) {
						return { error: String(err) }
					}
				},
			})
		},
	},
}
