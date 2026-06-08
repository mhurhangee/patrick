import { stat } from "node:fs/promises"
import type { TaskEntry, TaskType } from "@patrickos/shared"
import { Hono } from "hono"
import {
	ensureTaskDirs,
	listArtifacts,
	listSources,
	readTasks,
	writeTasks,
} from "../lib/fs"

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
	const { path, name, taskType } = await c.req.json<{
		path: string
		name?: string
		taskType?: TaskType
	}>()
	const tasks = await readTasks()
	const updated = tasks.map((p) =>
		p.path === path
			? {
					...p,
					...(name !== undefined ? { name } : {}),
					...(taskType !== undefined ? { taskType } : {}),
				}
			: p,
	)
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

tasksRouter.get("/files", async (c) => {
	const path = c.req.query("path")
	if (!path) return c.json({ error: "path required" }, 400)

	const [sources, artifacts] = await Promise.all([
		listSources(path),
		listArtifacts(path),
	])

	return c.json({ sources, artifacts })
})

// Probe a folder path before adding it — does it exist, and how many source docs?
tasksRouter.get("/probe", async (c) => {
	const path = c.req.query("path")
	if (!path) return c.json({ error: "path required" }, 400)
	try {
		const s = await stat(path)
		if (!s.isDirectory()) return c.json({ exists: false, sourceCount: 0 })
		const sources = await listSources(path)
		return c.json({ exists: true, sourceCount: sources.length })
	} catch {
		return c.json({ exists: false, sourceCount: 0 })
	}
})
