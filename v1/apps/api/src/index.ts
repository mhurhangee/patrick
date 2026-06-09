import { Hono } from "hono";
import { cors } from "hono/cors";
import { ai } from "./routes/ai";
import { profiles } from "./routes/profiles";
import { tasks } from "./routes/tasks";

const app = new Hono();

app.use("*", cors());
app.get("/health", (c) => c.json({ ok: true }));
app.route("/profiles", profiles);
app.route("/ai", ai);
app.route("/tasks", tasks);

export default {
	port: Number(process.env.PORT ?? 3001),
	fetch: app.fetch,
};
