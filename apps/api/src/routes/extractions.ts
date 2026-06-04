import type { ExtractionRecord } from "@patrickos/shared"
import { Hono } from "hono"
import {
	deleteExtraction,
	listExtractions,
	readExcluded,
	readExtraction,
	writeExcluded,
	writeExtraction,
} from "../lib/fs"

export const extractionsRouter = new Hono()

// GET /extractions?taskPath=...  → which sources have an extraction
extractionsRouter.get("/", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	return c.json(await listExtractions(taskPath))
})

// GET /extractions/file?taskPath=...&filename=...  → one source's extraction record
extractionsRouter.get("/file", async (c) => {
	const taskPath = c.req.query("taskPath")
	const filename = c.req.query("filename")
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	return c.json(await readExtraction(taskPath, filename))
})

// PUT /extractions/file  → save an edited extraction record
extractionsRouter.put("/file", async (c) => {
	const { taskPath, record } = await c.req.json<{
		taskPath: string
		record: ExtractionRecord
	}>()
	if (!taskPath || !record?.filename)
		return c.json({ error: "taskPath and record.filename required" }, 400)
	const saved: ExtractionRecord = {
		...record,
		updatedAt: new Date().toISOString(),
	}
	await writeExtraction(taskPath, saved)
	return c.json(saved)
})

// GET /extractions/excluded?taskPath=...  → filenames flagged do-not-read
extractionsRouter.get("/excluded", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	return c.json(await readExcluded(taskPath))
})

// PUT /extractions/excluded  → replace the do-not-read list
extractionsRouter.put("/excluded", async (c) => {
	const { taskPath, filenames } = await c.req.json<{
		taskPath: string
		filenames: string[]
	}>()
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	await writeExcluded(taskPath, filenames ?? [])
	return c.json({ ok: true })
})

// DELETE /extractions/file?taskPath=...&filename=...  → remove a source's extraction
extractionsRouter.delete("/file", async (c) => {
	const taskPath = c.req.query("taskPath")
	const filename = c.req.query("filename")
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	await deleteExtraction(taskPath, filename)
	return c.json({ ok: true })
})
