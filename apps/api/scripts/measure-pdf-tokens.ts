// Measure how many input tokens a PDF page costs, per vendor.
//
// PDF→token conversion happens in each provider's ingestion pipeline (extract
// text + render each page to an image) before the model sees anything. It is
// identical across that vendor's models and stable over time — so we measure
// per VENDOR (3 numbers), using the cheapest model, not per model.
//
// Usage:
//   bun run apps/api/scripts/measure-pdf-tokens.ts [pdf-folder]
//
// PDFs must encode their page count in the filename: 1.pdf, 2.pdf, 4.pdf, 8.pdf
// (any leading integer works). A 0-page baseline call isolates fixed overhead.
//
// Keys are read from settings.yaml (per-vendor key, or a gateway key that reaches
// all three) and can be overridden with env vars:
//   ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / AI_GATEWAY_API_KEY

import { readdir, readFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { type FilePart, generateText, type TextPart } from "ai"
import { readSettings, setConfigDir } from "../src/lib/fs"
import { createModel, reasoningOptions } from "../src/lib/patent-prompt"

type Vendor = "anthropic" | "openai" | "google"

// Cheapest model per vendor — the page-token cost is identical across tiers.
const VENDOR_FAST: Record<Vendor, string> = {
	anthropic: "anthropic/claude-haiku-4.5",
	openai: "openai/gpt-5.4-mini",
	google: "google/gemini-3.1-flash-lite",
}

const PROMPT = "Reply with just: OK"

type Target = { vendor: Vendor; provider: string; apiKey: string }

const ALL_VENDORS = Object.keys(VENDOR_FAST) as Vendor[]

// Prefer the gateway: one key reaches all three vendors via a single, consistent
// path. Only fall back to per-vendor direct keys if no gateway key is set.
// Keys come from env (Bun auto-loads .env) or settings.yaml (point at a profile
// with CONFIG_DIR=profile/<name>).
async function resolveTargets(): Promise<Target[]> {
	if (process.env.CONFIG_DIR) setConfigDir(process.env.CONFIG_DIR)
	const ai = (await readSettings().catch(() => null))?.ai

	const gatewayKey = (process.env.AI_GATEWAY_API_KEY || ai?.gatewayKey)?.trim()
	if (gatewayKey) {
		return ALL_VENDORS.map((vendor) => ({
			vendor,
			provider: "gateway",
			apiKey: gatewayKey,
		}))
	}

	const directKey: Record<Vendor, string | undefined> = {
		anthropic: process.env.ANTHROPIC_API_KEY || ai?.anthropicKey,
		openai: process.env.OPENAI_API_KEY || ai?.openaiKey,
		google: process.env.GOOGLE_GENERATIVE_AI_API_KEY || ai?.googleKey,
	}
	return ALL_VENDORS.flatMap((vendor) => {
		const direct = directKey[vendor]?.trim()
		return direct ? [{ vendor, provider: vendor, apiKey: direct }] : []
	})
}

// Input-token count for the prompt plus an optional PDF.
async function inputTokens(target: Target, pdf?: Uint8Array): Promise<number> {
	const modelId = VENDOR_FAST[target.vendor]
	const model = createModel(target.provider, target.apiKey, modelId)
	const content: Array<TextPart | FilePart> = [{ type: "text", text: PROMPT }]
	if (pdf) {
		content.push({ type: "file", data: pdf, mediaType: "application/pdf" })
	}
	const { usage } = await generateText({
		model,
		maxOutputTokens: 16,
		...reasoningOptions(target.provider, modelId, "off", false),
		messages: [{ role: "user", content }],
	})
	return usage.inputTokens ?? 0
}

// PDFs named like "4.pdf" → 4 pages.
function pagesOf(file: string): number {
	const m = basename(file).match(/^(\d+)/)
	return m ? Number.parseInt(m[1], 10) : 0
}

async function main() {
	const folder = resolve(
		process.argv[2] ?? join(import.meta.dir, "pdf-samples"),
	)

	let files: string[]
	try {
		files = (await readdir(folder))
			.filter((f) => f.toLowerCase().endsWith(".pdf") && pagesOf(f) > 0)
			.sort((a, b) => pagesOf(a) - pagesOf(b))
	} catch {
		console.error(`No readable folder at ${folder}.`)
		console.error("Put 1.pdf, 2.pdf, 4.pdf, 8.pdf there (page count in name).")
		process.exit(1)
	}
	if (!files.length) {
		console.error(`No N.pdf files in ${folder} (e.g. 1.pdf, 2.pdf, 4.pdf).`)
		process.exit(1)
	}

	const targets = await resolveTargets()
	if (!targets.length) {
		console.error("No usable API keys (settings.yaml or env). Nothing to test.")
		process.exit(1)
	}

	const pdfs = await Promise.all(
		files.map(async (f) => ({
			pages: pagesOf(f),
			data: new Uint8Array(await readFile(join(folder, f))),
		})),
	)

	console.log(`\nFolder: ${folder}`)
	console.log(`Samples: ${pdfs.map((p) => `${p.pages}p`).join(", ")}\n`)

	const perPageByVendor: Partial<Record<Vendor, number>> = {}

	for (const target of targets) {
		const via = target.provider === "gateway" ? " (via gateway)" : ""
		console.log(`── ${target.vendor}${via} — ${VENDOR_FAST[target.vendor]}`)
		try {
			const baseline = await inputTokens(target)
			console.log(`   baseline (0p): ${baseline} tokens`)
			const perPage: number[] = []
			for (const { pages, data } of pdfs) {
				const total = await inputTokens(target, data)
				const pp = (total - baseline) / pages
				perPage.push(pp)
				console.log(
					`   ${String(pages).padStart(2)}p: ${String(total).padStart(6)} → ${pp.toFixed(0)}/page`,
				)
			}
			const avg = Math.round(
				perPage.reduce((a, b) => a + b, 0) / perPage.length,
			)
			perPageByVendor[target.vendor] = avg
			console.log(`   ≈ ${avg} tokens/page\n`)
		} catch (err) {
			console.log(`   ERROR: ${err instanceof Error ? err.message : err}\n`)
		}
	}

	console.log("Paste into apps/frontend/src/lib/ai-models.ts:\n")
	console.log("export const PDF_TOKENS_PER_PAGE: Record<Vendor, number> = {")
	for (const vendor of ALL_VENDORS) {
		const v = perPageByVendor[vendor]
		console.log(`\t${vendor}: ${v ?? "/* not measured */ 0"},`)
	}
	console.log("}\n")
}

main()
