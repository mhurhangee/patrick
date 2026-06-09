import { Hono } from "hono";
import { cors } from "hono/cors";
import { profiles } from "./routes/profiles";

const app = new Hono();

app.use("*", cors());
app.get("/health", (c) => c.json({ ok: true }));
app.route("/profiles", profiles);

export default {
	port: Number(process.env.PORT ?? 3001),
	fetch: app.fetch,
};
