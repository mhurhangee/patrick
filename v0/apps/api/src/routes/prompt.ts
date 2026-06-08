import {
	isTokenId,
	type OpenDoc,
	type SurfaceId,
	TOKEN_RE,
	type TokenId,
} from "@patrickos/shared"
import { Hono } from "hono"
import { readSettings, readTasks } from "../lib/fs"
import { type ResolveCtx, render } from "../lib/prompt"

export const promptRouter = new Hono()

// Live-preview render for the prompt editor. Same engine the AI uses, so the
// preview can't drift. Returns the assembled system string, each token's
// resolved text (for the chip inspector / Formatted view), and warnings.
promptRouter.post("/render", async (c) => {
	const body = await c.req.json<{
		surface: SurfaceId
		template: string
		taskPath?: string
		openDocs?: OpenDoc[]
		excludedFiles?: string[]
		currentSourceName?: string
	}>()

	const { surface, template, taskPath } = body
	const settings = await readSettings()

	const taskType = taskPath
		? (await readTasks()).find((t) => t.path === taskPath)?.taskType
		: undefined

	const ctx: ResolveCtx = {
		settings,
		taskPath,
		taskType,
		openDocs: body.openDocs,
		excludedFiles: body.excludedFiles,
		currentSourceName: body.currentSourceName,
	}

	const { system, warnings } = await render(template, ctx, surface)

	// Resolve each token in isolation for the inspector / inline chip values.
	const perToken: Record<string, string> = {}
	const seen = new Set<TokenId>()
	for (const m of template.matchAll(TOKEN_RE)) {
		const name = m[1]
		if (!isTokenId(name) || seen.has(name)) continue
		seen.add(name)
		perToken[name] = (await render(`<${name}>`, ctx, surface)).system
	}

	return c.json({ system, perToken, warnings })
})
