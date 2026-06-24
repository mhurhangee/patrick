import { basename, extname, join } from "node:path";
import {
	type Chart,
	type Chat,
	type ClaimLimitation,
	createClaimChart,
	createTask,
	type DocumentMeta,
	type ExtractedDoc,
	type SearchIndex,
	type Task,
} from "@patrick/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { handleChat } from "../lib/ai/chat";
import { generateDocumentLabel } from "../lib/ai/label";
import { parseClaimSpine } from "../lib/ai/parse-claim";
import { readReference } from "../lib/ai/read-reference";
import {
	deleteChart,
	listCharts,
	readChart,
	saveChart,
	updateChartMeta,
} from "../lib/charts";
import {
	deleteChat,
	listChats,
	readChat,
	saveChat,
	updateChatMeta,
} from "../lib/chats";
import {
	createBlankDocument,
	deleteDocument,
	folderExists,
	listDocuments,
	readExtractedText,
	readSearchIndex,
	renameDocument,
	saveDocumentBytes,
	saveExtractedText,
	saveRetrievedDocument,
	saveSearchIndex,
	unlockDocumentCopy,
	writeDocumentMeta,
} from "../lib/documents";
import { fetchPublication } from "../lib/patents";
import { readProfile } from "../lib/profiles";
import { deleteTask, listTasks, readTask, writeTask } from "../lib/tasks";

export const tasks = new Hono();

// Patrick chat — streams a UI message response; docx tool calls round-trip to
// the client to run against the live editor. See lib/ai/chat.ts.
tasks.post("/:id/chat", handleChat);

// Persisted chats (under <folder>/.patrick/chats). Saved on each turn's finish.
tasks.get("/:id/chats", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	return c.json(await listChats(task.folder));
});
tasks.get("/:id/chats/:chatId", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const chat = await readChat(task.folder, c.req.param("chatId"));
	return chat ? c.json(chat) : c.json({ error: "not found" }, 404);
});
// Write a chat record directly (used by Fork to materialise a sliced copy).
tasks.put("/:id/chats/:chatId", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const body =
		await c.req.json<
			Pick<Chat, "systemTemplate" | "model" | "pinnedSources" | "messages">
		>();
	const chat = await saveChat(task.folder, {
		id: c.req.param("chatId"),
		systemTemplate: body.systemTemplate,
		model: body.model,
		pinnedSources: body.pinnedSources,
		messages: body.messages,
	});
	return c.json(chat);
});
tasks.delete("/:id/chats/:chatId", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	await deleteChat(task.folder, c.req.param("chatId"));
	return c.json({ ok: true });
});

// Attorney-set chat meta — star and rename (custom title).
tasks.post("/:id/chats/:chatId/meta", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const patch = await c.req.json<{ starred?: boolean; customTitle?: string }>();
	const updated = await updateChatMeta(
		task.folder,
		c.req.param("chatId"),
		patch,
	);
	if (!updated) return c.json({ error: "chat not found" }, 404);
	return c.json({ ok: true });
});

// Charts — Patrick-generated analysis objects (claim charts first) under
// <folder>/.patrick/charts. Canonical JSON; the editor saves the full record.
tasks.get("/:id/charts", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	return c.json(await listCharts(task.folder));
});
tasks.get("/:id/charts/:chartId", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const chart = await readChart(task.folder, c.req.param("chartId"));
	return chart ? c.json(chart) : c.json({ error: "not found" }, 404);
});
// Create a blank claim chart — the spine is filled by the parse/construe nodes.
tasks.post("/:id/charts", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const { title } = await c.req
		.json<{ title?: string }>()
		.catch(() => ({ title: undefined }));
	const chart = await saveChart(
		task.folder,
		createClaimChart(crypto.randomUUID(), title?.trim() || undefined),
	);
	return c.json(chart, 201);
});
// Save a chart wholesale (the editor owns the full object).
tasks.put("/:id/charts/:chartId", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const body = await c.req.json<Chart>();
	const chart = await saveChart(task.folder, {
		...body,
		id: c.req.param("chartId"),
	});
	return c.json(chart);
});
tasks.delete("/:id/charts/:chartId", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	await deleteChart(task.folder, c.req.param("chartId"));
	return c.json({ ok: true });
});
// Attorney-set chart meta — star and rename.
tasks.post("/:id/charts/:chartId/meta", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const patch = await c.req.json<{ starred?: boolean; title?: string }>();
	const updated = await updateChartMeta(
		task.folder,
		c.req.param("chartId"),
		patch,
	);
	if (!updated) return c.json({ error: "chart not found" }, 404);
	return c.json({ ok: true });
});

// Parse a claim from a source document into limitations (nodes 0–1). Returns them for
// the client to append to the spine — building it up claim by claim at the HITL gate.
tasks.post("/:id/charts/:chartId/parse", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const { filename, profileId, claims, constructionSupport } =
		await c.req.json<{
			filename?: string;
			profileId?: string;
			claims?: string;
			constructionSupport?: string;
		}>();
	if (!filename) return c.json({ error: "missing document" }, 400);
	const profile = profileId ? await readProfile(profileId) : null;
	if (!profile) return c.json({ error: "profile not found" }, 404);
	try {
		const parsed = await parseClaimSpine(
			task.folder,
			basename(filename),
			profile.ai,
			(claims ?? "1").trim() || "1",
			constructionSupport ? basename(constructionSupport) : undefined,
		);
		if (!parsed || parsed.length === 0)
			return c.json(
				{ error: "couldn't parse a claim from that document" },
				400,
			);
		return c.json({ limitations: parsed });
	} catch (err) {
		return c.json(
			{ error: err instanceof Error ? err.message : "parse failed" },
			500,
		);
	}
});

// Whole-document read of one reference (hybrid / full-doc methods): judge each of the
// given limitations over the full reference text (+ optional primer). Returns the
// per-limitation reads; the client sources citations and saves the cells.
tasks.post("/:id/charts/:chartId/read", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const { profileId, reference, primer, limitations } = await c.req.json<{
		profileId?: string;
		reference?: string;
		primer?: string;
		limitations?: ClaimLimitation[];
	}>();
	if (!reference) return c.json({ error: "missing reference" }, 400);
	if (!limitations?.length) return c.json({ error: "no rows to analyse" }, 400);
	const profile = profileId ? await readProfile(profileId) : null;
	if (!profile) return c.json({ error: "profile not found" }, 404);
	try {
		const reads = await readReference(
			task.folder,
			profile.ai,
			basename(reference),
			primer ? basename(primer) : undefined,
			limitations,
		);
		if (!reads)
			return c.json(
				{ error: "couldn't read that reference (no extractable text?)" },
				400,
			);
		return c.json(reads);
	} catch (err) {
		return c.json(
			{ error: err instanceof Error ? err.message : "read failed" },
			500,
		);
	}
});

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

// AI-generate a label + chat suggestions for one document (the kebab "Suggest a
// label" action) and apply them. Runs on the profile's model with reasoning off.
tasks.post("/:id/documents/:filename/label", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const { profileId } = await c.req.json<{ profileId?: string }>();
	const profile = profileId ? await readProfile(profileId) : null;
	if (!profile) return c.json({ error: "profile not found" }, 404);
	try {
		const result = await generateDocumentLabel(
			task.folder,
			basename(c.req.param("filename")),
			profile.ai,
		);
		if (!result) return c.json({ error: "could not read the document" }, 400);
		return c.json(result);
	} catch (err) {
		return c.json(
			{ error: err instanceof Error ? err.message : "labelling failed" },
			500,
		);
	}
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

// Fetch a published EP/WO document's full text from EPO OPS (BYOK) and save it
// as a retrieved reference in the folder, ready to pin. Driven by the
// fetchPublication HITL tool after the attorney confirms.
tasks.post("/:id/publication", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const { number, profileId } = await c.req.json<{
		number?: string;
		profileId?: string;
	}>();
	if (!number) return c.json({ error: "missing publication number" }, 400);
	// No key needed — the router uses EPO OPS for EP/WO when a key is set, else
	// Google Patents (which also covers US and backstops everything).
	const profile = profileId ? await readProfile(profileId) : null;
	const result = await fetchPublication(number, profile);
	if (!result.ok)
		return c.json(
			{ error: result.message },
			result.status as ContentfulStatusCode,
		);
	const filename = await saveRetrievedDocument(
		task.folder,
		result.filename,
		result.markdown,
		undefined,
		result.source,
	);
	return c.json({ filename, summary: result.summary }, 201);
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
	".md": "text/markdown; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
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

// Store the extracted text (text layer or OCR) for a PDF — the frontend does the
// extraction (it has pdfjs + tesseract), the server just persists it + marks the
// doc. Drives the selectable overlay and the agent's text context mode.
tasks.put("/:id/documents/:filename/text", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const doc = await c.req.json<ExtractedDoc>();
	await saveExtractedText(task.folder, basename(c.req.param("filename")), doc);
	return c.json({ ok: true });
});

tasks.get("/:id/documents/:filename/text", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const doc = await readExtractedText(
		task.folder,
		basename(c.req.param("filename")),
	);
	return doc ? c.json(doc) : c.json({ error: "not found" }, 404);
});

// Store / load the search-index sidecar for a document — the frontend builds it
// (chunk + embed in the webview), the server just persists it under .patrick/index.
tasks.put("/:id/documents/:filename/index", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const index = await c.req.json<SearchIndex>();
	await saveSearchIndex(task.folder, basename(c.req.param("filename")), index);
	return c.json({ ok: true });
});

tasks.get("/:id/documents/:filename/index", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const index = await readSearchIndex(
		task.folder,
		basename(c.req.param("filename")),
	);
	return index ? c.json(index) : c.json({ error: "not found" }, 404);
});
