import { fastModelFor, type Provider } from "@patrick/shared";
import { generateText } from "ai";
import { Hono } from "hono";
import { createModel } from "../lib/ai/model";

export const ai = new Hono();

const PROVIDERS: Provider[] = ["anthropic", "openai", "google", "gateway"];

// Verify a BYOK key with a 1-token generation on the provider's fast model.
// Always responds 200 with { valid } so the client reads a clean result.
ai.post("/verify", async (c) => {
	const { provider, apiKey } = await c.req.json<{
		provider?: Provider;
		apiKey?: string;
	}>();

	if (!apiKey || !provider || !PROVIDERS.includes(provider)) {
		return c.json({ valid: false, error: "Missing or unknown provider/key" });
	}

	try {
		const model = createModel(provider, apiKey, fastModelFor(provider));
		await generateText({ model, prompt: "hi", maxOutputTokens: 1 });
		return c.json({ valid: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		const isAuth = /401|403|unauthorized|invalid|authentication/i.test(message);
		return c.json({
			valid: false,
			error: isAuth ? "Invalid API key" : "Verification failed",
		});
	}
});
