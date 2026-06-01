import type { Settings } from "@patrickos/shared"
import { Hono } from "hono"
import { readSettings, writeSettings } from "../lib/fs"

export const settingsRouter = new Hono()

settingsRouter.get("/", async (c) => {
	const settings = await readSettings()
	return c.json(settings)
})

settingsRouter.put("/", async (c) => {
	const patch = await c.req.json<DeepPartial<Settings>>()
	const current = await readSettings()
	const updated = deepMerge(current, patch)
	await writeSettings(updated)
	return c.json(updated)
})

// ─── Utilities ────────────────────────────────────────────────────────────────

type DeepPartial<T> = T extends object
	? { [K in keyof T]?: DeepPartial<T[K]> }
	: T

function deepMerge<T extends object>(base: T, patch: Record<string, unknown>): T {
	const result = { ...base } as Record<string, unknown>
	for (const key of Object.keys(patch)) {
		const patchVal = patch[key]
		const baseVal = result[key]
		if (
			patchVal !== undefined &&
			patchVal !== null &&
			typeof patchVal === "object" &&
			!Array.isArray(patchVal) &&
			typeof baseVal === "object" &&
			baseVal !== null
		) {
			result[key] = deepMerge(baseVal as object, patchVal as Record<string, unknown>)
		} else if (patchVal !== undefined) {
			result[key] = patchVal
		}
	}
	return result as T
}
