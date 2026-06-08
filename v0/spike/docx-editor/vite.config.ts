import type { IncomingMessage, ServerResponse } from "node:http"
import { getAiSdkTools } from "@eigenpal/docx-editor-agents/ai-sdk/server"
import react from "@vitejs/plugin-react"
import { convertToModelMessages, stepCountIs, streamText } from "ai"
import { defineConfig, loadEnv, type Plugin } from "vite"

const SYSTEM = `You are AgentPat, a patent attorney's drafting assistant editing a Word (.docx) document via tools.

Workflow — ALWAYS locate before you mutate:
1. Call read_document (or find_text) to see the document and get each paragraph's stable paraId.
2. To change wording, call suggest_change with:
   - paraId: the target paragraph's id
   - search: the EXACT existing substring to replace (must appear verbatim in that paragraph)
   - replaceWith: the new text (use '' to delete; use search='' to append at the paragraph end)
   Each suggest_change creates a tracked change the attorney can accept or reject.
3. Briefly tell the user what you changed and why.

Be surgical. Never invent claim text; ground every edit in what read_document returned.`

function chatApi(apiKey: string, model: string): Plugin {
	return {
		name: "spike-chat-api",
		configureServer(server) {
			server.middlewares.use("/api/chat", async (req: IncomingMessage, res: ServerResponse) => {
				if (req.method !== "POST") {
					res.statusCode = 405
					return res.end("method not allowed")
				}
				if (!apiKey) {
					res.statusCode = 500
					return res.end("AI_GATEWAY_API_KEY missing from repo-root .env")
				}
				try {
					const body = await readJson(req)
					const result = streamText({
						model,
						system: SYSTEM,
						messages: await convertToModelMessages(body.messages),
						tools: getAiSdkTools(),
						stopWhen: stepCountIs(12),
						onError: ({ error }) => console.error("[chat] streamText error:", error),
					})
					result.pipeUIMessageStreamToResponse(res)
				} catch (e) {
					console.error("[chat] handler error:", e)
					res.statusCode = 500
					res.end(JSON.stringify({ error: String(e) }))
				}
			})
		},
	}
}

function readJson(req: IncomingMessage): Promise<{ messages: unknown[] }> {
	return new Promise((resolve, reject) => {
		let data = ""
		req.on("data", (c) => {
			data += c
		})
		req.on("end", () => {
			try {
				resolve(JSON.parse(data || "{}"))
			} catch (e) {
				reject(e)
			}
		})
		req.on("error", reject)
	})
}

// Load the repo-root .env (AI_GATEWAY_API_KEY lives there, not in the spike dir).
const env = loadEnv("development", "../../", "")
const apiKey = env.AI_GATEWAY_API_KEY ?? ""
if (apiKey) process.env.AI_GATEWAY_API_KEY = apiKey
const model = env.SPIKE_MODEL || "anthropic/claude-sonnet-4.5"

export default defineConfig({
	plugins: [react(), chatApi(apiKey, model)],
	server: { port: 5180 },
})
