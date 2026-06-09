import { basename } from "node:path";
import { createTask, type DocumentMeta, type Task } from "@patrick/shared";
import { Hono } from "hono";
import {
	folderExists,
	listDocuments,
	writeDocumentMeta,
} from "../lib/documents";
import { deleteTask, listTasks, readTask, writeTask } from "../lib/tasks";

export const tasks = new Hono();

tasks.get("/", async (c) => c.json(await listTasks()));

tasks.get("/:id", async (c) => {
	const task = await readTask(c.req.param("id"));
	return task ? c.json(task) : c.json({ error: "not found" }, 404);
});

tasks.post("/", async (c) => {
	const { folder } = await c.req.json<{ folder?: string }>();
	const path = folder?.trim();
	if (!path) return c.json({ error: "Missing folder path" }, 400);
	if (!(await folderExists(path)))
		return c.json({ error: "Folder not found on disk" }, 400);

	const task = createTask(crypto.randomUUID(), path, basename(path) || path);
	await writeTask(task);
	return c.json(task, 201);
});

tasks.put("/:id", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json<Task>();
	const task: Task = { ...body, id };
	await writeTask(task);
	return c.json(task);
});

tasks.delete("/:id", async (c) => {
	await deleteTask(c.req.param("id"));
	return c.json({ ok: true });
});

tasks.get("/:id/documents", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	return c.json(await listDocuments(task.folder));
});

tasks.put("/:id/documents", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const meta = await c.req.json<DocumentMeta>();
	await writeDocumentMeta(task.folder, meta);
	return c.json({ ok: true });
});
