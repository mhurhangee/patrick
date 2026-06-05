import { DEFAULT_QUICK_MODEL } from "@patrickos/shared"
import { createGateway, generateText } from "ai"
import { Hono } from "hono"
import { createModel } from "../lib/patent-prompt"

export const aiRouter = new Hono()

const PROVIDERS = ["anthropic", "openai", "gateway"] as const
type Provider = (typeof PROVIDERS)[number]

const ALLOWED_GATEWAY_PROVIDERS = new Set(["anthropic"])

aiRouter.post("/verify", async (c) => {
	const { provider, apiKey } = await c.req.json<{
		provider?: Provider
		apiKey?: string
	}>()

	if (!apiKey || !provider) {
		return c.json({ valid: false, error: "Missing provider or API key" }, 400)
	}

	if (!PROVIDERS.includes(provider)) {
		return c.json({ valid: false, error: "Unknown provider" }, 400)
	}

	try {
		const key = apiKey.trim()
		// Verify with the provider's fast model from the shared catalog (via the
		// same createModel the app uses — so prefix/vendor handling stays correct).
		const model = createModel(provider, key, DEFAULT_QUICK_MODEL[provider])

		await generateText({ model, prompt: "hi", maxOutputTokens: 1 })
		return c.json({ valid: true })
	} catch (error) {
		const message = error instanceof Error ? error.message : ""
		const isAuthError =
			message.includes("401") ||
			message.includes("403") ||
			message.toLowerCase().includes("unauthorized") ||
			message.toLowerCase().includes("invalid") ||
			message.toLowerCase().includes("authentication")

		return c.json(
			{
				valid: false,
				error: isAuthError ? "Invalid API key" : "Verification failed",
			},
			isAuthError ? 401 : 500,
		)
	}
})

aiRouter.post("/models", async (c) => {
	const { apiKey } = await c.req.json<{ apiKey?: string }>()
	if (!apiKey) return c.json({ error: "Missing key" }, 400)

	try {
		const gateway = createGateway({ apiKey: apiKey.trim() })
		const { models } = await gateway.getAvailableModels()
		const filtered = models
			.filter((m) => ALLOWED_GATEWAY_PROVIDERS.has(m.specification.provider))
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
