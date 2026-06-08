import { access } from "node:fs/promises"
import { join } from "node:path"
import { Hono } from "hono"
import { getConfigDir, setConfigDir } from "../lib/fs"

export const configRouter = new Hono()

configRouter.get("/dir", (c) => {
	return c.json({ configDir: getConfigDir() })
})

configRouter.put("/dir", async (c) => {
	const { configDir } = await c.req.json<{ configDir: string }>()
	setConfigDir(configDir)
	return c.json({ ok: true, configDir })
})

// Check whether a folder already has a settings.yaml — lets the frontend
// decide "load existing" vs "create new profile" without reading the full file.
configRouter.get("/probe", async (c) => {
	const dir = c.req.query("dir")
	if (!dir) return c.json({ error: "dir required" }, 400)
	try {
		await access(join(dir, "settings.yaml"))
		return c.json({ exists: true })
	} catch {
		return c.json({ exists: false })
	}
})
