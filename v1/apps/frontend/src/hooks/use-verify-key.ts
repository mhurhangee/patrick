import type { Provider } from "@patrick/shared";
import { useState } from "react";
import { aiApi } from "@/api/ai";

export type KeyStatus = "idle" | "verifying" | "valid" | "invalid";

export function useVerifyKey() {
	const [status, setStatus] = useState<KeyStatus>("idle");

	const verify = async (provider: Provider, key: string) => {
		if (!key) {
			setStatus("idle");
			return;
		}
		setStatus("verifying");
		try {
			const { valid } = await aiApi.verify(provider, key);
			setStatus(valid ? "valid" : "invalid");
		} catch {
			setStatus("invalid");
		}
	};

	const reset = () => setStatus("idle");

	return { status, verify, reset };
}
