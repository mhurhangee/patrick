import { Hono } from "hono"
import { cors } from "hono/cors"
import { projectsRouter } from "./routes/projects"
import { assetsRouter } from "./routes/assets"

const app = new Hono()

app.use("*", cors())

app.get("/health", (c) => c.json({ ok: true }))
app.route("/projects", projectsRouter)
app.route("/assets", assetsRouter)

export default {
	port: Number(process.env.PORT) || 3000,
	fetch: app.fetch,
}
