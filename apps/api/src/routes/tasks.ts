import { readdir, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import type { TaskEntry, TaskType } from "@patrickos/shared"
import { Hono } from "hono"
import { ensureTaskDirs, readTasks, writeTasks } from "../lib/fs"

export const tasksRouter = new Hono()

// ─── Task registry ─────────────────────────────────────────────────────────

tasksRouter.get("/", async (c) => {
	const tasks = await readTasks()
	return c.json(tasks)
})

tasksRouter.post("/", async (c) => {
	const { path, name, taskType } = await c.req.json<{
		path: string
		name?: string
		taskType?: TaskType
	}>()
	const tasks = await readTasks()
	if (tasks.find((p) => p.path === path)) {
		return c.json(tasks.find((p) => p.path === path))
	}
	await ensureTaskDirs(path)
	const entry: TaskEntry = {
		path,
		name: name ?? path.split("/").at(-1) ?? path,
		addedAt: new Date().toISOString(),
		...(taskType ? { taskType } : {}),
	}
	await writeTasks([...tasks, entry])
	return c.json(entry, 201)
})

tasksRouter.patch("/", async (c) => {
	const { path, name } = await c.req.json<{ path: string; name: string }>()
	const tasks = await readTasks()
	const updated = tasks.map((p) => (p.path === path ? { ...p, name } : p))
	await writeTasks(updated)
	const entry = updated.find((p) => p.path === path)
	if (!entry) return c.json({ error: "not found" }, 404)
	return c.json(entry)
})

tasksRouter.delete("/", async (c) => {
	const { path } = await c.req.json<{ path: string }>()
	const tasks = await readTasks()
	await writeTasks(tasks.filter((p) => p.path !== path))
	return c.json({ ok: true })
})

// ─── Folder file listing ──────────────────────────────────────────────────────

const SOURCE_EXTS = new Set([".pdf", ".docx", ".doc"])
const SKIP_DIRS = new Set(["artifacts", "chats", "analysis"])

tasksRouter.get("/files", async (c) => {
	const path = c.req.query("path")
	if (!path) return c.json({ error: "path required" }, 400)

	const [sources, artifacts] = await Promise.all([
		listSources(path),
		listArtifacts(path),
	])

	return c.json({ sources, artifacts })
})

async function listSources(taskPath: string) {
	try {
		const entries = await readdir(taskPath, { withFileTypes: true })
		const files = []
		for (const entry of entries) {
			if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
			if (!entry.isFile()) continue
			const ext = extname(entry.name).toLowerCase()
			if (!SOURCE_EXTS.has(ext)) continue
			files.push({
				filename: entry.name,
				path: join(taskPath, entry.name),
				ext: ext.slice(1),
			})
		}
		return files
	} catch {
		return []
	}
}

const ARTIFACT_EXTS = new Set([".json", ".docx"])

async function listArtifacts(taskPath: string) {
	const artifactsPath = join(taskPath, "artifacts")
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
