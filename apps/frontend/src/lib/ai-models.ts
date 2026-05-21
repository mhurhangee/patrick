export type GatewayModel = {
	id: string
	name: string
	description?: string | null
	pricing?: { input: string; output: string } | null
	specification: { provider: string; modelId: string }
}

export const DEFAULT_QUICK_MODEL = "anthropic/claude-haiku-4.5"
export const DEFAULT_DETAILED_MODEL = "anthropic/claude-sonnet-4.6"
