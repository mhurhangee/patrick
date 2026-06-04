import type { Flags } from "@patrickos/shared"
import { Hono } from "hono"
import { readFlags, writeFlags } from "../lib/fs"

// Per-file flags (excluded "do not read" + starred "key document"), filename-keyed
// so they travel with the task folder. One file: meta/flags.json.
export const flagsRouter = new Hono()

// GET /flags?taskPath=...  → { excluded, starred }
flagsRouter.get("/", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	return c.json(await readFlags(taskPath))
})

// PUT /flags  → replace the whole flags file
flagsRouter.put("/", async (c) => {
	const { taskPath, flags } = await c.req.json<{
		taskPath: string
		flags: Flags
	}>()
	if (!taskPath || !flags)
		return c.json({ error: "taskPath and flags required" }, 400)
	await writeFlags(taskPath, {
		excluded: flags.excluded ?? [],
		starred: flags.starred ?? [],
	})
	return c.json({ ok: true })
})
