import { basename, extname, join } from "node:path";
import {
	assembleClaimAnalysisPrompt,
	assembleClaimConstructionPrompt,
	type Chart,
	type Chat,
	type ClaimLimitation,
	createClaimChart,
	createTask,
	DEFAULT_CLAIM_ANALYSIS_RUBRIC,
	DEFAULT_CLAIM_CONSTRUCTION_RUBRIC,
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
	relockDocument,
	renameDocument,
	saveExtractedText,
	saveRetrievedDocument,
	saveSearchIndex,
	unlockDocumentInPlace,
	writeDocumentMeta,
} from "../lib/documents";
import { danceFor } from "../lib/docx/dance";
import { listComments, readDraftRuns } from "../lib/docx/redline";
import { fetchPublication } from "../lib/patents";
import { readProfile } from "../lib/profiles";
import { deleteTask, listTasks, readTask, writeTask } from "../lib/tasks";

export const tasks = new Hono();

// Patrick chat — streams a UI message response; draft edits execute server-side
// against the .docx on disk (tracked changes via the dance). See lib/ai/chat.ts.
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
	const { filename, profileId, claims, constructionSupport, model } =
		await c.req.json<{
			filename?: string;
			profileId?: string;
			claims?: string;
			constructionSupport?: string;
			model?: string;
		}>();
	if (!filename) return c.json({ error: "missing document" }, 400);
	const profile = profileId ? await readProfile(profileId) : null;
	if (!profile) return c.json({ error: "profile not found" }, 404);
	try {
		const parsed = await parseClaimSpine(
			task.folder,
			basename(filename),
			{ ...profile.ai, model: model || profile.ai.model },
			assembleClaimConstructionPrompt(
				profile.prompts.claimConstruction?.trim() ||
					DEFAULT_CLAIM_CONSTRUCTION_RUBRIC,
			),
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
	const { profileId, reference, primer, limitations, model } =
		await c.req.json<{
			profileId?: string;
			reference?: string;
			primer?: string;
			limitations?: ClaimLimitation[];
			model?: string;
		}>();
	if (!reference) return c.json({ error: "missing reference" }, 400);
	if (!limitations?.length) return c.json({ error: "no rows to analyse" }, 400);
	const profile = profileId ? await readProfile(profileId) : null;
	if (!profile) return c.json({ error: "profile not found" }, 404);
	try {
		const reads = await readReference(
			task.folder,
			{ ...profile.ai, model: model || profile.ai.model },
			assembleClaimAnalysisPrompt(
				profile.prompts.claimAnalysis?.trim() || DEFAULT_CLAIM_ANALYSIS_RUBRIC,
			),
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

// Unlock an original .docx for in-place tracked-changes editing (the pristine
// bytes are snapshotted to .patrick/backups first).
tasks.post("/:id/documents/:filename/unlock", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const name = await unlockDocumentInPlace(
		task.folder,
		basename(c.req.param("filename")),
	);
	return name
		? c.json({ filename: name }, 201)
		: c.json({ error: "not found" }, 404);
});

// Re-lock an unlocked original — flip it back to read-only.
tasks.post("/:id/documents/:filename/relock", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const ok = await relockDocument(
		task.folder,
		basename(c.req.param("filename")),
	);
	return ok ? c.json({ ok: true }) : c.json({ error: "not unlocked" }, 400);
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

// The dance, observable: lock state, parked edits, last save, @Patrick comment
// mentions — the draft panel polls this while a docx tab is open.
tasks.get("/:id/documents/:filename/draft-status", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const dance = danceFor(task.folder, basename(c.req.param("filename")));
	return c.json(await dance.status());
});

// Acknowledge surfaced parked-edit failures (the panel showed them).
tasks.post(
	"/:id/documents/:filename/draft-status/clear-failures",
	async (c) => {
		const task = await readTask(c.req.param("id"));
		if (!task) return c.json({ error: "not found" }, 404);
		danceFor(task.folder, basename(c.req.param("filename"))).clearFailures();
		return c.json({ ok: true });
	},
);

// Accept or reject Patrick's redline in one paragraph, in place — the in-app
// equivalent of Word's accept/reject. Rides the dance (parks while open in Word).
tasks.post("/:id/documents/:filename/resolve", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const { paragraphIndex, action } = await c.req
		.json<{ paragraphIndex?: number; action?: "accept" | "reject" }>()
		.catch(() => ({ paragraphIndex: undefined, action: undefined }));
	if (
		typeof paragraphIndex !== "number" ||
		(action !== "accept" && action !== "reject")
	)
		return c.json({ error: "paragraphIndex + action required" }, 400);
	const dance = danceFor(task.folder, basename(c.req.param("filename")));
	const outcome = await dance.applyOrPark({
		kind: "resolve",
		paragraphIndex,
		action,
	});
	return c.json(outcome);
});

// A .docx as paragraphs-of-runs (pending redlines marked ins/del) + its
// comments — the review view. The real accept/reject can happen in Word too.
tasks.get("/:id/documents/:filename/docx-text", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const name = basename(c.req.param("filename"));
	const file = Bun.file(join(task.folder, name));
	if (!(await file.exists())) return c.json({ error: "file not found" }, 404);
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		const [paragraphs, comments] = await Promise.all([
			readDraftRuns(bytes),
			listComments(bytes),
		]);
		return c.json({ paragraphs, comments });
	} catch {
		return c.json({ error: "could not read this .docx" }, 422);
	}
});

// Open a document in its native app (Word/LibreOffice) — the api runs on the
// attorney's machine (Tauri sidecar / local dev), so a plain OS opener works.
tasks.post("/:id/documents/:filename/open", async (c) => {
	const task = await readTask(c.req.param("id"));
	if (!task) return c.json({ error: "not found" }, 404);
	const name = basename(c.req.param("filename"));
	const path = join(task.folder, name);
	if (!(await Bun.file(path).exists()))
		return c.json({ error: "file not found" }, 404);
	const cmd =
		process.platform === "darwin"
			? ["open", path]
			: process.platform === "win32"
				? ["cmd", "/c", "start", "", path]
				: ["xdg-open", path];
	try {
		Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
		return c.json({ ok: true });
	} catch {
		return c.json({ error: "could not open the document" }, 500);
	}
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
