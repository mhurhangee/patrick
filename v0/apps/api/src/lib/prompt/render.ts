import {
	CATALOG,
	isTokenId,
	type SurfaceId,
	TOKEN_RE,
	type TokenId,
	type TokenKind,
} from "@patrickos/shared"
import type { Tool } from "ai"
import { RESOLVERS, type ResolveCtx } from "./registry"

export type RenderResult = {
	system: string
	tools: Record<string, Tool>
	warnings: string[]
	// Per known token in the template: did it actually contribute content? For
	// tools, filled = wired. Lets callers log what context a turn really got.
	report: { id: TokenId; kind: TokenKind; filled: boolean }[]
}

// Render a template string against a context. The set of tool tokens present in
// the template IS the agent's toolset — adding/removing a <TOOLNAME> wires or
// drops that tool. Context flows in via the open/closed document tokens, not a
// silent pull channel. Unknown / out-of-surface / duplicate tokens warn but
// never block.
//
// Async because some context resolvers read files (notes, extractions) — and
// each token is resolved once, only if it appears, so that I/O is lazy.
export async function render(
	template: string,
	ctx: ResolveCtx,
	surface: SurfaceId,
): Promise<RenderResult> {
	const tools: Record<string, Tool> = {}
	const warnings: string[] = []
	const report: RenderResult["report"] = []
	const replacements = new Map<string, string>()
	const counts = new Map<string, number>()

	for (const m of template.matchAll(TOKEN_RE)) {
		const name = m[1]
		counts.set(name, (counts.get(name) ?? 0) + 1)
		if (replacements.has(name)) continue // resolve each token once

		if (!isTokenId(name)) {
			warnings.push(`Unknown token <${name}> — left as-is.`)
			replacements.set(name, m[0])
			continue
		}
		const id = name as TokenId
		const meta = CATALOG[id]
		if (!(meta.surfaces as readonly SurfaceId[]).includes(surface))
			warnings.push(`<${id}> isn't available on ${surface}; it still resolved.`)

		const resolver = RESOLVERS[id]
		if (resolver.kind === "tool") {
			const built = resolver.build(ctx)
			if (!built) {
				replacements.set(id, "") // omitted (e.g. fetchPatent without EPO keys)
			} else {
				tools[meta.label] = built
				replacements.set(id, meta.wrapper ?? "")
			}
			report.push({ id, kind: meta.kind, filled: !!built })
		} else {
			const out = (await resolver.resolve(ctx)) ?? ""
			replacements.set(id, out)
			report.push({ id, kind: meta.kind, filled: out.trim() !== "" })
		}
	}

	for (const [name, c] of counts)
		if (c > 1) warnings.push(`<${name}> appears ${c} times.`)

	const system = template.replace(
		TOKEN_RE,
		(match, name: string) => replacements.get(name) ?? match,
	)
	// Optional blocks resolve to "" — collapse the blank lines they leave behind
	// so output stays clean (mirrors the old assemble() filter-then-join).
	const cleaned = system.replace(/\n{3,}/g, "\n\n").trim()
	return { system: cleaned, tools, warnings, report }
}
