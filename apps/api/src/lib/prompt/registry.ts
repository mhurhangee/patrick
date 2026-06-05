import { readFile } from "node:fs/promises"
import {
	ASSET_CONFIGS,
	CATALOG,
	type ExtractionRecord,
	fill,
	type OpenDoc,
	type Settings,
	TASK_CONFIGS,
	type TaskType,
	type TokenId,
} from "@patrickos/shared"
import { type Tool, tool } from "ai"
import { z } from "zod"
import { fetchPatent } from "../epo-ops"
import {
	listArtifacts,
	listExtractions,
	listSources,
	readExtraction,
	readNote,
} from "../fs"

// Everything a resolver / tool-builder might need, assembled per request. Fields
// are per-surface — a resolver returns null (or a tool builder returns null)
// when the context it needs is absent, so the same ctx shape serves every
// surface. `settings` is the only constant.
export type ResolveCtx = {
	settings: Settings
	// AgentPat
	taskPath?: string
	taskType?: TaskType
	/** The documents the attorney has open, with their per-doc context mode. */
	openDocs?: OpenDoc[]
	/** Basenames of excluded files — for the prompt text + closed-docs filtering. */
	excludedFiles?: string[]
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
function formatExtractionBody(rec: ExtractionRecord): string {
	return Object.entries(rec.details)
		.filter(
			([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
		)
		.map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join("; ") : String(v)}`)
		.join("\n")
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

	// Open docs = the OPEN=CONTEXT spine. Each open doc rendered in full per its
	// context mode: PDFs' originals go out-of-band as file parts (we just point at
	// them here); artifact text + derivations + notes go inline.
	OPENDOCUMENTS: {
		kind: "scope",
		resolve: async ({ taskPath, openDocs }) => {
			if (!taskPath || !openDocs?.length) return null
			const blocks: string[] = []
			for (const doc of openDocs) {
				const name = basename(doc.path)
				if (doc.kind === "artifact") {
					// Artifact = the attorney's own draft; full text inline (unless they've
					// dropped it to derivations-only, which an artifact has none of).
					const text =
						doc.mode === "derivations"
							? ""
							: plateToText(await readFile(doc.path, "utf8").catch(() => ""))
					blocks.push(
						`## ${name} (artifact — your draft)\n${text || "(empty)"}`,
					)
					continue
				}
				const lines = [`## ${name}`]
				const isPdf = name.toLowerCase().endsWith(".pdf")
				const wantOriginal = doc.mode !== "derivations"
				const wantDerived = doc.mode !== "original"
				if (wantOriginal)
					lines.push(
						isPdf
							? "_Original PDF attached above as a file part._"
							: "_Original has no text representation; rely on its derivations._",
					)
				else lines.push("_Original withheld (derivations-only mode)._")
				if (wantDerived) {
					const rec = await readExtraction(taskPath, name)
					if (rec)
						lines.push(`### Extracted data\n${formatExtractionBody(rec)}`)
					const raw = await readNote(taskPath, name)
					const noteText = raw ? plateToText(raw) : ""
					if (noteText) lines.push(`### Notes\n${noteText}`)
				}
				blocks.push(lines.join("\n"))
			}
			return fill(w("OPENDOCUMENTS"), { list: blocks.join("\n\n") })
		},
	},

	// Closed docs = cheap awareness only. Every source/artifact NOT open and NOT
	// excluded, as one metadata line — never its content. The triage layer.
	CLOSEDDOCUMENTS: {
		kind: "scope",
		resolve: async ({ taskPath, openDocs, excludedFiles }) => {
			if (!taskPath) return null
			const openNames = new Set((openDocs ?? []).map((d) => basename(d.path)))
			const excluded = new Set(excludedFiles ?? [])
			const skip = (name: string) => openNames.has(name) || excluded.has(name)

			const [sources, artifacts, extractions] = await Promise.all([
				listSources(taskPath),
				listArtifacts(taskPath),
				listExtractions(taskPath),
			])
			const typeByName = new Map(
				extractions.map((e) => [e.filename, e.assetType]),
			)

			const lines: string[] = []
			for (const s of sources) {
				if (skip(s.filename)) continue
				const type = typeByName.get(s.filename)
				const raw = await readNote(taskPath, s.filename)
				const hasNote = !!(raw && plateToText(raw).trim())
				lines.push(
					`- ${s.filename}${type ? ` (${type})` : ""} — derivations: ${
						type ? "extraction" : "none"
					}; notes: ${hasNote ? "yes" : "no"}`,
				)
			}
			// Artifacts: one entry per draft (.json is the source of truth; skip .docx
			// exports) with a short slice, since they have no derivations/notes.
			for (const a of artifacts) {
				if (a.ext !== "json" || skip(a.filename)) continue
				const title = a.filename.replace(/\.json$/, "")
				const text = plateToText(await readFile(a.path, "utf8").catch(() => ""))
				const slice = text.replace(/\s+/g, " ").trim().slice(0, 200)
				lines.push(`- ${title} (artifact)${slice ? ` — "${slice}…"` : ""}`)
			}
			return lines.length
				? fill(w("CLOSEDDOCUMENTS"), { list: lines.join("\n") })
				: null
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
