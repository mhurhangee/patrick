import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { Hono } from "hono"
import { artifactsDir } from "../lib/fs"

export const artifactsRouter = new Hono()

function jsonPath(taskPath: string, filename: string): string {
	const stem = basename(filename, extname(filename))
	return join(artifactsDir(taskPath), `${stem}.json`)
}

// GET /artifacts/content?taskPath=...&filename=...
artifactsRouter.get("/content", async (c) => {
	const taskPath = c.req.query("taskPath")
	const filename = c.req.query("filename")
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)

	try {
		const content = await readFile(jsonPath(taskPath, filename), "utf8")
		return c.json({ content })
	} catch {
		return c.json({ content: "" })
	}
})

// PUT /artifacts/content — save Plate JSON
artifactsRouter.put("/content", async (c) => {
	const { taskPath, filename, content } = await c.req.json<{
		taskPath: string
		filename: string
		content: string
	}>()
	const path = jsonPath(taskPath, filename)
	await mkdir(artifactsDir(taskPath), { recursive: true })
	const tmp = `${path}.tmp`
	await writeFile(tmp, content, "utf8")
	await rename(tmp, path)
	return c.json({ ok: true })
})

// POST /artifacts — create new empty artifact
artifactsRouter.post("/", async (c) => {
	const { taskPath, title } = await c.req.json<{
		taskPath: string
		title: string
	}>()
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
	const filename = `${slug || "draft"}.json`
	const path = join(artifactsDir(taskPath), filename)
	await mkdir(artifactsDir(taskPath), { recursive: true })
	const tmp = `${path}.tmp`
	await writeFile(tmp, "[]", "utf8")
	await rename(tmp, path)
	return c.json({ filename, path, taskPath, title }, 201)
})
