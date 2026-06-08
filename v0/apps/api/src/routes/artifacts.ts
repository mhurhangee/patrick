import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { Hono } from "hono"
import { artifactsDir } from "../lib/fs"

export const artifactsRouter = new Hono()

function jsonPath(taskPath: string, filename: string): string {
	const stem = basename(filename, extname(filename))
	return join(artifactsDir(taskPath), `${stem}.json`)
}

// Title → filename slug, matching the create route.
function slugify(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "draft"
	)
}

async function exists(path: string): Promise<boolean> {
	return stat(path)
		.then(() => true)
		.catch(() => false)
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
	const slug = slugify(title)
	const filename = `${slug}.json`
	const path = join(artifactsDir(taskPath), filename)
	await mkdir(artifactsDir(taskPath), { recursive: true })
	const tmp = `${path}.tmp`
	await writeFile(tmp, "[]", "utf8")
	await rename(tmp, path)
	return c.json({ filename, path, taskPath, title }, 201)
})

// PUT /artifacts/rename — rename an artifact's file(s) (.json + best-effort .docx)
artifactsRouter.put("/rename", async (c) => {
	const { taskPath, filename, newTitle } = await c.req.json<{
		taskPath: string
		filename: string
		newTitle: string
	}>()
	if (!taskPath || !filename || !newTitle?.trim())
		return c.json({ error: "taskPath, filename and newTitle required" }, 400)

	const dir = artifactsDir(taskPath)
	const stem = basename(filename, extname(filename))
	const slug = slugify(newTitle)
	const newFilename = `${slug}.json`
	const oldPath = join(dir, `${stem}.json`)
	const newPath = join(dir, newFilename)

	if (newPath !== oldPath && (await exists(newPath)))
		return c.json({ error: "An artifact with that name already exists" }, 409)

	await rename(oldPath, newPath)
	// Move the exported .docx alongside it, if one exists.
	const oldDocx = join(dir, `${stem}.docx`)
	if (await exists(oldDocx)) await rename(oldDocx, join(dir, `${slug}.docx`))

	const title = newFilename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
	return c.json({ filename: newFilename, path: newPath, taskPath, title })
})

// DELETE /artifacts?taskPath=...&filename=...  → remove an artifact (.json + .docx)
artifactsRouter.delete("/", async (c) => {
	const taskPath = c.req.query("taskPath")
	const filename = c.req.query("filename")
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	const dir = artifactsDir(taskPath)
	const stem = basename(filename, extname(filename))
	await rm(join(dir, `${stem}.json`), { force: true })
	await rm(join(dir, `${stem}.docx`), { force: true })
	return c.json({ ok: true })
})
