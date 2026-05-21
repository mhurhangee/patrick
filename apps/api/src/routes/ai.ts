import { createGateway, generateText } from "ai"
import { Hono } from "hono"

export const aiRouter = new Hono()

const ALLOWED_PROVIDERS = new Set(["anthropic"])

aiRouter.post("/models", async (c) => {
	const { apiKey } = await c.req.json<{ apiKey?: string }>()
	if (!apiKey) return c.json({ error: "Missing key" }, 400)

	try {
		const gateway = createGateway({ apiKey: apiKey.trim() })
		const { models } = await gateway.getAvailableModels()
		const filtered = models
			.filter((m) => ALLOWED_PROVIDERS.has(m.specification.provider))
			.sort((a, b) => {
				const pa = a.specification.provider
				const pb = b.specification.provider
				return pa !== pb ? pa.localeCompare(pb) : a.name.localeCompare(b.name)
			})
		return c.json({ models: filtered })
	} catch (error) {
		const message = error instanceof Error ? error.message : ""
		return c.json({ error: message || "Failed to fetch models" }, 500)
	}
})

aiRouter.post("/verify", async (c) => {
	const body = await c.req.json<{ apiKey?: string }>()
	const apiKey = body.apiKey

	if (!apiKey || typeof apiKey !== "string") {
		return c.json({ valid: false, error: "Missing API key" }, 400)
	}

	try {
		const gateway = createGateway({ apiKey: apiKey.trim() })
		await generateText({
			model: gateway("anthropic/claude-haiku-4.5"),
			prompt: "hi",
			maxOutputTokens: 1,
		})
		return c.json({ valid: true })
	} catch (error) {
		const message = error instanceof Error ? error.message : ""
		const isAuthError =
			message.includes("401") ||
			message.includes("403") ||
			message.toLowerCase().includes("unauthorized") ||
			message.toLowerCase().includes("invalid")

		return c.json(
			{
				valid: false,
				error: isAuthError ? "Invalid API key" : "Verification failed",
			},
			isAuthError ? 401 : 500,
		)
	}
})
