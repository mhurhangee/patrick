import { readdir, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import type { ProjectEntry } from "@patrickos/shared"
import { Hono } from "hono"
import { ensureProjectDirs, readProjects, writeProjects } from "../lib/fs"

export const projectsRouter = new Hono()

// ─── Project registry ─────────────────────────────────────────────────────────

projectsRouter.get("/", async (c) => {
	const projects = await readProjects()
	return c.json(projects)
})

projectsRouter.post("/", async (c) => {
	const { path, name } = await c.req.json<{ path: string; name?: string }>()
	const projects = await readProjects()
	if (projects.find((p) => p.path === path)) {
		return c.json(projects.find((p) => p.path === path))
	}
	await ensureProjectDirs(path)
	const entry: ProjectEntry = {
		path,
		name: name ?? path.split("/").at(-1) ?? path,
		addedAt: new Date().toISOString(),
	}
	await writeProjects([...projects, entry])
	return c.json(entry, 201)
})

projectsRouter.patch("/", async (c) => {
	const { path, name } = await c.req.json<{ path: string; name: string }>()
	const projects = await readProjects()
	const updated = projects.map((p) => (p.path === path ? { ...p, name } : p))
	await writeProjects(updated)
	const entry = updated.find((p) => p.path === path)
	if (!entry) return c.json({ error: "not found" }, 404)
	return c.json(entry)
})

projectsRouter.delete("/", async (c) => {
	const { path } = await c.req.json<{ path: string }>()
	const projects = await readProjects()
	await writeProjects(projects.filter((p) => p.path !== path))
	return c.json({ ok: true })
})

// ─── Folder file listing ──────────────────────────────────────────────────────

const SOURCE_EXTS = new Set([".pdf", ".docx", ".doc"])
const SKIP_DIRS = new Set(["artifacts", "chats", "analysis"])

projectsRouter.get("/files", async (c) => {
	const path = c.req.query("path")
	if (!path) return c.json({ error: "path required" }, 400)

	const [sources, artifacts] = await Promise.all([
		listSources(path),
		listArtifacts(path),
	])

	return c.json({ sources, artifacts })
})

async function listSources(projectPath: string) {
	try {
		const entries = await readdir(projectPath, { withFileTypes: true })
		const files = []
		for (const entry of entries) {
			if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
			if (!entry.isFile()) continue
			const ext = extname(entry.name).toLowerCase()
			if (!SOURCE_EXTS.has(ext)) continue
			files.push({
				filename: entry.name,
				path: join(projectPath, entry.name),
				ext: ext.slice(1),
			})
		}
		return files
	} catch {
		return []
	}
}

const ARTIFACT_EXTS = new Set([".json", ".docx"])

async function listArtifacts(projectPath: string) {
	const artifactsPath = join(projectPath, "artifacts")
	try {
		const entries = await readdir(artifactsPath, { withFileTypes: true })
		const files = []
		for (const entry of entries) {
			if (!entry.isFile()) continue
			const ext = extname(entry.name).toLowerCase()
			if (!ARTIFACT_EXTS.has(ext)) continue
			const filePath = join(artifactsPath, entry.name)
			const s = await stat(filePath)
			files.push({
				filename: entry.name,
				path: filePath,
				ext: ext.slice(1),
				createdAt: s.birthtime.toISOString(),
				updatedAt: s.mtime.toISOString(),
			})
		}
		return files
	} catch {
		return []
	}
}
