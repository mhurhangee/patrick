import { readFile } from "node:fs/promises"
import {
	CATALOG,
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
import { listArtifacts, listSources, readNote } from "../fs"

// Everything a resolver / tool-builder might need, assembled per request. Fields
// are per-surface — a resolver returns null (or a tool builder returns null)
// when the context it needs is absent, so the same ctx shape serves every
// surface. `settings` is the only constant.
export type ResolveCtx = {
	settings: Settings
	// AgentPat
	taskPath?: string
	taskType?: TaskType
	/** The documents the attorney has open (OPEN=CONTEXT: open ⇒ full content). */
	openDocs?: OpenDoc[]
	/** Basenames of excluded files — for the prompt text + closed-docs filtering. */
	excludedFiles?: string[]
	// Editor surfaces (NotePat)
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

	// Open docs = the OPEN=CONTEXT spine. The source itself in full (PDFs go
	// out-of-band as file parts, artifact text inline) plus its notes — nothing
	// derived stands between the agent and the real document.
	OPENDOCUMENTS: {
		kind: "scope",
		resolve: async ({ taskPath, openDocs }) => {
			if (!taskPath || !openDocs?.length) return null
			const blocks: string[] = []
			for (const doc of openDocs) {
				const name = basename(doc.path)
				if (doc.kind === "artifact") {
					const text = plateToText(
						await readFile(doc.path, "utf8").catch(() => ""),
					)
					blocks.push(
						`## ${name} (artifact — your draft)\n${text || "(empty)"}`,
					)
					continue
				}
				const isPdf = name.toLowerCase().endsWith(".pdf")
				const lines = [
					`## ${name}`,
					isPdf
						? "_Full document attached above as a file part._"
						: "_This document has no text representation in context; open it in the editor or rely on its notes._",
				]
				const raw = await readNote(taskPath, name)
				const noteText = raw ? plateToText(raw) : ""
				if (noteText) lines.push(`### Notes\n${noteText}`)
				blocks.push(lines.join("\n"))
			}
			return fill(w("OPENDOCUMENTS"), { list: blocks.join("\n\n") })
		},
	},

	// Closed docs = a cheap signpost only. Every source/artifact NOT open and NOT
	// excluded, as one line: filename, file type, and any note the attorney wrote
	// (the note is the awareness layer) — never the document's content.
	CLOSEDDOCUMENTS: {
		kind: "scope",
		resolve: async ({ taskPath, openDocs, excludedFiles }) => {
			if (!taskPath) return null
			const openNames = new Set((openDocs ?? []).map((d) => basename(d.path)))
			const excluded = new Set(excludedFiles ?? [])
			const skip = (name: string) => openNames.has(name) || excluded.has(name)

			const [sources, artifacts] = await Promise.all([
				listSources(taskPath),
				listArtifacts(taskPath),
			])

			const lines: string[] = []
			for (const s of sources) {
				if (skip(s.filename)) continue
				const raw = await readNote(taskPath, s.filename)
				const note = raw ? plateToText(raw).replace(/\s+/g, " ").trim() : ""
				lines.push(
					`- ${s.filename} (${s.ext.toUpperCase()})${
						note ? ` — ${note.slice(0, 280)}` : ""
					}`,
				)
			}
			// Artifacts: one entry per draft (.json is the source of truth; skip .docx
			// exports) with a short slice.
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

	CURRENTSOURCE: {
		kind: "scope",
		resolve: ({ currentSourceName }) =>
			currentSourceName
				? fill(w("CURRENTSOURCE"), { filename: currentSourceName })
				: null,
	},

	// ─── Tools ──────────────────────────────────────────────────────────────────
	REQUESTOPENFILE: {
		kind: "tool",
		// No execute — a client-side confirmation tool. The loop stops; the client
		// shows an accept/reject card and, on accept, opens the file so it's attached
		// on the next turn (OPEN=CONTEXT: only the user can put a doc in context).
		build: () =>
			tool({
				description: CATALOG.REQUESTOPENFILE.description,
				inputSchema: z.object({
					filename: z
						.string()
						.describe(
							"The exact filename to open, as shown in the Other Documents list (e.g. 'US7557198.pdf')",
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
