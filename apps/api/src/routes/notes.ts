import { Hono } from "hono"
import { deleteNote, listNotes, readNote, writeNote } from "../lib/fs"

// Per-source human-authored notes — Plate JSON saved as notes/{filename}.json.
// Not a derivation (no AI pass); reuses the Plate editor + debounced save.
export const notesRouter = new Hono()

// GET /notes?taskPath=...  → source filenames that have a note (drives the dot)
notesRouter.get("/", async (c) => {
	const taskPath = c.req.query("taskPath")
	if (!taskPath) return c.json({ error: "taskPath required" }, 400)
	return c.json(await listNotes(taskPath))
})

// GET /notes/file?taskPath=...&filename=...  → { content } | null
notesRouter.get("/file", async (c) => {
	const taskPath = c.req.query("taskPath")
	const filename = c.req.query("filename")
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	const content = await readNote(taskPath, filename)
	return c.json(content === null ? null : { content })
})

// PUT /notes/file  → save the note's Plate JSON
notesRouter.put("/file", async (c) => {
	const { taskPath, filename, content } = await c.req.json<{
		taskPath: string
		filename: string
		content: string
	}>()
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	await writeNote(taskPath, filename, content ?? "")
	return c.json({ ok: true })
})

// DELETE /notes/file?taskPath=...&filename=...  → remove a source's note
notesRouter.delete("/file", async (c) => {
	const taskPath = c.req.query("taskPath")
	const filename = c.req.query("filename")
	if (!taskPath || !filename)
		return c.json({ error: "taskPath and filename required" }, 400)
	await deleteNote(taskPath, filename)
	return c.json({ ok: true })
})
