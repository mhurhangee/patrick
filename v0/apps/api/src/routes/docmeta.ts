import type { DocMeta } from "@patrickos/shared"
import { Hono } from "hono"
import { readDocMeta, updateDocMeta } from "../lib/fs"

// Per-document metadata (signpost / tags / excluded / starred), filename-keyed so
// it travels with the task folder. One file: meta/docmeta.json.
export const docMetaRouter = new Hono()

// GET /docmeta?taskPath=...  → { [filename]: DocMeta }
docMetaRouter.get("/", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	return c.json(await readDocMeta(taskPath))
})

// PUT /docmeta  → merge a patch into one doc's metadata; returns the new map
docMetaRouter.put("/", async (c) => {
	const { taskPath, filename, patch } = await c.req.json<{
		taskPath: string
		filename: string
		patch: Partial<DocMeta>
	}>()
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	return c.json(await updateDocMeta(taskPath, filename, patch ?? {}))
})
