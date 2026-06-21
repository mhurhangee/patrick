import { Hono } from "hono";
import { verifyCredentials } from "../lib/patents/epo/auth";

export const ops = new Hono();

// Verify EPO OPS credentials with a real OAuth exchange against OPS. Always
// responds 200 with { valid } so the client reads a clean result.
ops.post("/verify", async (c) => {
	const { consumerKey, consumerSecret } = await c.req.json<{
		consumerKey?: string;
		consumerSecret?: string;
	}>();

	if (!consumerKey || !consumerSecret) {
		return c.json({ valid: false, error: "Missing credentials" });
	}

	try {
		const valid = await verifyCredentials({ consumerKey, consumerSecret });
		return c.json({
			valid,
			error: valid ? undefined : "Invalid OPS key/secret",
		});
	} catch {
		return c.json({ valid: false, error: "Verification failed" });
	}
});
