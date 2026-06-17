// Models, all through the Vercel AI Gateway, so a model is just a routing
// string (`vendor/model`) and swapping one is a one-line change. Each pipeline
// role has a default; override per run via env (BENCH_GENERATOR_MODEL, …) or an
// explicit arg. The gateway key comes from the repo-root .env — the scripts load
// it with `bun --env-file=../../.env`.
//
// Generator and judge MUST differ (a model grading its own output rubber-stamps
// its own errors); the harness checks this at startup.

import { createGateway } from "ai";

export type Role = "generator" | "judge" | "system";

/** Default model per role. Opus generates, GPT judges (independent vendors). */
const DEFAULT_MODELS: Record<Role, string> = {
	generator: "anthropic/claude-opus-4.8",
	judge: "openai/gpt-5.5",
	system: "anthropic/claude-opus-4.8",
};

let gateway: ReturnType<typeof createGateway> | null = null;
function provider(): ReturnType<typeof createGateway> {
	if (gateway) return gateway;
	const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
	if (!apiKey)
		throw new Error(
			"AI_GATEWAY_API_KEY not set. Add it to the repo-root .env; the scripts load it via `bun --env-file=../../.env`.",
		);
	gateway = createGateway({ apiKey });
	return gateway;
}

/** The routing string for a role: explicit arg › env override › default. */
export function modelId(role: Role, override?: string): string {
	return (
		override?.trim() ||
		process.env[`BENCH_${role.toUpperCase()}_MODEL`]?.trim() ||
		DEFAULT_MODELS[role]
	);
}

/** The gateway model for a role, ready to pass to generateText/generateObject. */
export function modelFor(role: Role, override?: string) {
	return provider()(modelId(role, override));
}
