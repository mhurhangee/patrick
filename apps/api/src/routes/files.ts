import { readFile, stat } from "node:fs/promises"
import { extname } from "node:path"
import { Hono } from "hono"

export const filesRouter = new Hono()

const MIME: Record<string, string> = {
	".pdf": "application/pdf",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".doc": "application/msword",
	".txt": "text/plain",
	".md": "text/markdown",
	".json": "application/json",
}

// Stream a file from disk by absolute path.
// Used by the frontend to display PDFs and other source files.
filesRouter.get("/stream", async (c) => {
	const path = c.req.query("path")
	if (!path) return c.json({ error: "path required" }, 400)

	try {
		await stat(path)
		const data = await readFile(path)
		const ext = extname(path).toLowerCase()
		const contentType = MIME[ext] ?? "application/octet-stream"
		return new Response(data, {
			headers: {
				"Content-Type": contentType,
				"Content-Disposition": "inline",
				"Cache-Control": "private, max-age=60",
			},
		})
	} catch {
		return c.json({ error: "File not found" }, 404)
	}
})
