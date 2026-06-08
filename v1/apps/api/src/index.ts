import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

export default {
	port: Number(process.env.PORT ?? 3001),
	fetch: app.fetch,
};
