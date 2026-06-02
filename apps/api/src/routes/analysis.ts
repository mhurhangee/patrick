import type { AnalysisRecord } from "@patrickos/shared"
import { Hono } from "hono"
import {
	deleteAnalysis,
	listAnalysis,
	readAnalysis,
	readExcluded,
	writeAnalysis,
	writeExcluded,
} from "../lib/fs"

export const analysisRouter = new Hono()

// GET /analysis?taskPath=...  → which sources have been analysed
analysisRouter.get("/", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	return c.json(await listAnalysis(taskPath))
})

// GET /analysis/file?taskPath=...&filename=...  → one source's analysis record
analysisRouter.get("/file", async (c) => {
	const taskPath = c.req.query("taskPath")
	const filename = c.req.query("filename")
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	return c.json(await readAnalysis(taskPath, filename))
})

// PUT /analysis/file  → save an edited analysis record
analysisRouter.put("/file", async (c) => {
	const { taskPath, record } = await c.req.json<{
		taskPath: string
		record: AnalysisRecord
	}>()
	if (!taskPath || !record?.filename)
		return c.json({ error: "taskPath and record.filename required" }, 400)
	const saved: AnalysisRecord = {
		...record,
		updatedAt: new Date().toISOString(),
	}
	await writeAnalysis(taskPath, saved)
	return c.json(saved)
})

// GET /analysis/excluded?taskPath=...  → filenames flagged do-not-read
analysisRouter.get("/excluded", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	return c.json(await readExcluded(taskPath))
})

// PUT /analysis/excluded  → replace the do-not-read list
analysisRouter.put("/excluded", async (c) => {
	const { taskPath, filenames } = await c.req.json<{
		taskPath: string
		filenames: string[]
	}>()
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	await writeExcluded(taskPath, filenames ?? [])
	return c.json({ ok: true })
})

// DELETE /analysis/file?taskPath=...&filename=...  → remove a source's analysis
analysisRouter.delete("/file", async (c) => {
	const taskPath = c.req.query("taskPath")
	const filename = c.req.query("filename")
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	await deleteAnalysis(taskPath, filename)
	return c.json({ ok: true })
})
