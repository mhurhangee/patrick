import { Hono } from "hono"
import { readSignposts, writeSignpost } from "../lib/fs"

// Per-source signposts (a one-liner "what is this document"), filename-keyed so
// they travel with the task folder. One file: meta/signposts.json.
export const signpostsRouter = new Hono()

// GET /signposts?taskPath=...  → { [filename]: signpost }
signpostsRouter.get("/", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	return c.json(await readSignposts(taskPath))
})

// PUT /signposts  → set (or clear, when blank) one source's signpost
signpostsRouter.put("/", async (c) => {
	const { taskPath, filename, signpost } = await c.req.json<{
		taskPath: string
		filename: string
		signpost: string
	}>()
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	await writeSignpost(taskPath, filename, signpost ?? "")
	return c.json({ ok: true })
})
