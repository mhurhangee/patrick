import { Hono } from "hono"
import { cors } from "hono/cors"
import { aiRouter } from "./routes/ai"
import { artifactsRouter } from "./routes/artifacts"
import { chatsRouter } from "./routes/chats"
import { configRouter } from "./routes/config"
import { editorAiRouter } from "./routes/editor-ai"
import { extractionsRouter } from "./routes/extractions"
import { extractpatRouter } from "./routes/extractpat"
import { filesRouter } from "./routes/files"
import { flagsRouter } from "./routes/flags"
import { notesRouter } from "./routes/notes"
import { promptRouter } from "./routes/prompt"
import { settingsRouter } from "./routes/settings"
import { tasksRouter } from "./routes/tasks"

const app = new Hono()

app.use("*", cors())

app.get("/health", (c) => c.json({ ok: true }))
app.route("/config", configRouter)
app.route("/tasks", tasksRouter)
app.route("/extractions", extractionsRouter)
app.route("/flags", flagsRouter)
app.route("/notes", notesRouter)
app.route("/chats", chatsRouter)
app.route("/files", filesRouter)
app.route("/artifacts", artifactsRouter)
app.route("/ai", aiRouter)
app.route("/ai/editor", editorAiRouter)
app.route("/ai/extractpat", extractpatRouter)
app.route("/prompt", promptRouter)
app.route("/settings", settingsRouter)

export default {
	port: Number(process.env.PORT) || 3000,
	fetch: app.fetch,
	idleTimeout: 60,
}
