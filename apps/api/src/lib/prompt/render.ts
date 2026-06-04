import {
	CATALOG,
	isTokenId,
	type SurfaceId,
	TOKEN_RE,
	type TokenId,
} from "@patrickos/shared"
import type { Tool } from "ai"
import { RESOLVERS, type ResolveCtx } from "./registry"

export type RenderResult = {
	system: string
	tools: Record<string, Tool>
	warnings: string[]
}

// Render a template string against a context. The set of tool tokens present in
// the template IS the agent's toolset — that's the push/pull lever (include
// <EXTRACTEDDATA> to push content, or omit it and keep <READFILE> to pull).
// Unknown / out-of-surface / duplicate tokens warn but never block.
export function render(
	template: string,
	ctx: ResolveCtx,
	surface: SurfaceId,
): RenderResult {
	const tools: Record<string, Tool> = {}
	const warnings: string[] = []
	const seen = new Set<TokenId>()

	const system = template.replace(TOKEN_RE, (match, name: string) => {
		if (!isTokenId(name)) {
			warnings.push(`Unknown token <${name}> — left as-is.`)
			return match
		}
		const id = name as TokenId
		const meta = CATALOG[id]

		if (!(meta.surfaces as readonly SurfaceId[]).includes(surface))
			warnings.push(`<${id}> isn't available on ${surface}; it still resolved.`)
		if (seen.has(id)) warnings.push(`<${id}> appears more than once.`)
		seen.add(id)

		const resolver = RESOLVERS[id]
		if (resolver.kind === "tool") {
			const built = resolver.build(ctx)
			if (!built) return "" // omitted (e.g. fetchPatent without EPO keys)
			tools[meta.label] = built
			return meta.wrapper ?? ""
		}
		return resolver.resolve(ctx) ?? ""
	})

	// Optional blocks resolve to "" — collapse the blank lines they leave behind
	// so output stays clean (mirrors the old assemble() filter-then-join).
	const cleaned = system.replace(/\n{3,}/g, "\n\n").trim()
	return { system: cleaned, tools, warnings }
}
