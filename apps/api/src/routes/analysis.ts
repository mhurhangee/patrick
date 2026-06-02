import type { AnalysisRecord } from "@patrickos/shared"
import { Hono } from "hono"
import { listAnalysis, readAnalysis, writeAnalysis } from "../lib/fs"

export const analysisRouter = new Hono()

// GET /analysis?projectPath=...  → which sources have been analysed
analysisRouter.get("/", async (c) => {
	const projectPath = c.req.query("projectPath")
	if (!projectPath) return c.json({ error: "projectPath required" }, 400)
	return c.json(await listAnalysis(projectPath))
})

// GET /analysis/file?projectPath=...&filename=...  → one source's analysis record
analysisRouter.get("/file", async (c) => {
	const projectPath = c.req.query("projectPath")
	const filename = c.req.query("filename")
	if (!projectPath || !filename)
		return c.json({ error: "projectPath and filename required" }, 400)
	return c.json(await readAnalysis(projectPath, filename))
})

// PUT /analysis/file  → save an edited analysis record
analysisRouter.put("/file", async (c) => {
	const { projectPath, record } = await c.req.json<{
		projectPath: string
		record: AnalysisRecord
	}>()
	if (!projectPath || !record?.filename)
		return c.json({ error: "projectPath and record.filename required" }, 400)
	const saved: AnalysisRecord = {
		...record,
		updatedAt: new Date().toISOString(),
	}
	await writeAnalysis(projectPath, saved)
	return c.json(saved)
})
