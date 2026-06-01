import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { Hono } from "hono"
import { artifactsDir } from "../lib/fs"

export const artifactsRouter = new Hono()

function jsonPath(projectPath: string, filename: string): string {
	const stem = basename(filename, extname(filename))
	return join(artifactsDir(projectPath), `${stem}.json`)
}

// GET /artifacts/content?projectPath=...&filename=...
artifactsRouter.get("/content", async (c) => {
	const projectPath = c.req.query("projectPath")
	const filename = c.req.query("filename")
	if (!projectPath || !filename) return c.json({ error: "projectPath and filename required" }, 400)

	try {
		const content = await readFile(jsonPath(projectPath, filename), "utf8")
		return c.json({ content })
	} catch {
		return c.json({ content: "" })
	}
})

// PUT /artifacts/content — save Plate JSON
artifactsRouter.put("/content", async (c) => {
	const { projectPath, filename, content } = await c.req.json<{
		projectPath: string
		filename: string
		content: string
	}>()
	const path = jsonPath(projectPath, filename)
	await mkdir(artifactsDir(projectPath), { recursive: true })
	const tmp = `${path}.tmp`
	await writeFile(tmp, content, "utf8")
	await rename(tmp, path)
	return c.json({ ok: true })
})

// POST /artifacts — create new empty artifact
artifactsRouter.post("/", async (c) => {
	const { projectPath, title } = await c.req.json<{ projectPath: string; title: string }>()
	const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
	const filename = `${slug || "draft"}.json`
	const path = join(artifactsDir(projectPath), filename)
	await mkdir(artifactsDir(projectPath), { recursive: true })
	const tmp = `${path}.tmp`
	await writeFile(tmp, "[]", "utf8")
	await rename(tmp, path)
	return c.json({ filename, path, projectPath, title }, 201)
})
