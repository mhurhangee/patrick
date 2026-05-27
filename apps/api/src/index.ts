import { Hono } from "hono"
import { cors } from "hono/cors"
import { aiRouter } from "./routes/ai"
import { askpatRouter } from "./routes/askpat"
import { assetsRouter } from "./routes/assets"
import { chatsRouter } from "./routes/chats"
import { extractpatRouter } from "./routes/extractpat"
import { projectsRouter } from "./routes/projects"
import { settingsRouter } from "./routes/settings"

const app = new Hono()

app.use("*", cors())

app.get("/health", (c) => c.json({ ok: true }))
app.route("/projects", projectsRouter)
app.route("/assets", assetsRouter)
app.route("/chats", chatsRouter)
app.route("/ai", aiRouter)
app.route("/ai/askpat", askpatRouter)
app.route("/ai/extractpat", extractpatRouter)
app.route("/settings", settingsRouter)

export default {
	port: Number(process.env.PORT) || 3000,
	fetch: app.fetch,
	idleTimeout: 60,
}
