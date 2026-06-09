import { basename, extname, join } from "node:path";
import { createTask, type DocumentMeta, type Task } from "@patrick/shared";
import { Hono } from "hono";
import {
	createBlankDocument,
	deleteDocument,
	folderExists,
	listDocuments,
	renameDocument,
	saveDocumentBytes,
	unlockDocumentCopy,
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

// Create a new blank Patrick-owned .docx in the task folder.
tasks.post("/:id/documents", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const { filename } = await c.req
		.json<{ filename?: string }>()
		.catch(() => ({ filename: undefined }));
	const name = await createBlankDocument(task.folder, filename);
	return c.json({ filename: name }, 201);
});

// Unlock an original for editing → visible "(Patrick)" working copy in the folder.
tasks.post("/:id/documents/:filename/copy", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const name = await unlockDocumentCopy(
		task.folder,
		basename(c.req.param("filename")),
	);
	return name
		? c.json({ filename: name }, 201)
		: c.json({ error: "not found" }, 404);
});

// Save edited bytes back to a Patrick-owned doc. Originals are refused.
tasks.put("/:id/documents/:filename", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const bytes = await c.req.arrayBuffer();
	const result = await saveDocumentBytes(
		task.folder,
		basename(c.req.param("filename")),
		bytes,
	);
	if (result === "not-found") return c.json({ error: "file not found" }, 404);
	if (result === "forbidden")
		return c.json({ error: "original is read-only" }, 403);
	return c.json({ ok: true });
});

// Rename a Patrick-owned doc. Originals are refused.
tasks.post("/:id/documents/:filename/rename", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const { to } = await c.req.json<{ to?: string }>();
	const result = await renameDocument(
		task.folder,
		basename(c.req.param("filename")),
		to ?? "",
	);
	if (result.status === "not-found")
		return c.json({ error: "file not found" }, 404);
	if (result.status === "forbidden")
		return c.json({ error: "original is read-only" }, 403);
	return c.json({ filename: result.filename });
});

// Delete a Patrick-owned doc. Originals are refused (attorney's own files).
tasks.delete("/:id/documents/:filename", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const result = await deleteDocument(
		task.folder,
		basename(c.req.param("filename")),
	);
	if (result === "not-found") return c.json({ error: "file not found" }, 404);
	if (result === "forbidden")
		return c.json({ error: "original is read-only" }, 403);
	return c.json({ ok: true });
});

const MIME: Record<string, string> = {
	".pdf": "application/pdf",
	".docx":
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".doc": "application/msword",
};

// Stream a document's raw bytes for the viewer. basename() blocks path traversal.
tasks.get("/:id/documents/:filename", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const name = basename(c.req.param("filename"));
	const file = Bun.file(join(task.folder, name));
	if (!(await file.exists())) return c.json({ error: "file not found" }, 404);
	return new Response(file, {
		headers: {
			"Content-Type":
				MIME[extname(name).toLowerCase()] ?? "application/octet-stream",
		},
	});
});
