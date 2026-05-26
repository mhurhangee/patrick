import * as React from "react"
import {
	DEFAULT_DETAILED_MODEL,
	DEFAULT_QUICK_MODEL,
	type Provider,
} from "@/lib/ai-models"
import { api } from "@/lib/api"

type KeyStatus = "idle" | "verifying" | "valid" | "invalid"

interface AIContextValue {
	connectedToAI: boolean
	connectedBYOK: boolean
	provider: Provider
	apiKey: string
	keyStatus: KeyStatus
	quickModel: string
	detailedModel: string
	verifyKey: (prov: Provider, key: string) => Promise<void>
	saveAiSettings: (
		prov: Provider,
		key: string,
		quick: string,
		detailed: string,
	) => void
	clearApiKey: () => void
}

const AIContext = React.createContext<AIContextValue>({
	connectedToAI: false,
	connectedBYOK: false,
	provider: "anthropic",
	apiKey: "",
	keyStatus: "idle",
	quickModel: DEFAULT_QUICK_MODEL.anthropic,
	detailedModel: DEFAULT_DETAILED_MODEL.anthropic,
	verifyKey: async () => {},
	saveAiSettings: () => {},
	clearApiKey: () => {},
})

export function AIProvider({ children }: { children: React.ReactNode }) {
	const [provider, setProvider] = React.useState<Provider>("anthropic")
	const [apiKey, setApiKey] = React.useState("")
	const [keyStatus, setKeyStatus] = React.useState<KeyStatus>("idle")
	const [quickModel, setQuickModel] = React.useState(
		DEFAULT_QUICK_MODEL.anthropic,
	)
	const [detailedModel, setDetailedModel] = React.useState(
		DEFAULT_DETAILED_MODEL.anthropic,
	)

	React.useEffect(() => {
		api.settings.get().then((s) => {
			const p = (s.aiProvider as Provider) || "anthropic"
			const quick = s.aiQuickModel || DEFAULT_QUICK_MODEL.anthropic
			setProvider(p)
			setQuickModel(quick)
			setDetailedModel(s.aiDetailedModel || DEFAULT_DETAILED_MODEL.anthropic)
			const key = localStorage.getItem(`ai-${p}-key`) ?? ""
			setApiKey(key)
			// Sync to localStorage so copilot fetch can read them synchronously
			localStorage.setItem("askpat-provider", p)
			localStorage.setItem("askpat-quick-model", quick)
		})
	}, [])

	async function verifyKey(prov: Provider, key: string) {
		if (!key) {
			setKeyStatus("idle")
			return
		}
		setKeyStatus("verifying")
		try {
			const result = await api.ai.verifyKey(prov, key)
			setKeyStatus(result.valid ? "valid" : "invalid")
		} catch {
			setKeyStatus("invalid")
		}
	}

	function clearApiKey() {
		localStorage.removeItem(`ai-${provider}-key`)
		setApiKey("")
		setKeyStatus("idle")
	}

	function saveAiSettings(
		prov: Provider,
		key: string,
		quick: string,
		detailed: string,
	) {
		localStorage.setItem(`ai-${prov}-key`, key)
		localStorage.setItem("askpat-provider", prov)
		localStorage.setItem("askpat-quick-model", quick)
		setProvider(prov)
		setApiKey(key)
		setQuickModel(quick)
		setDetailedModel(detailed)
		api.settings.update({
			aiProvider: prov,
			aiQuickModel: quick,
			aiDetailedModel: detailed,
		})
	}

	const connectedBYOK = !!apiKey
	// connectedLocal and connectedCloud will extend this in future
	const connectedToAI = connectedBYOK

	return (
		<AIContext.Provider
			value={{
				connectedToAI,
				connectedBYOK,
				provider,
				apiKey,
				keyStatus,
				quickModel,
				detailedModel,
				verifyKey,
				saveAiSettings,
				clearApiKey,
			}}
		>
			{children}
		</AIContext.Provider>
	)
}

export function useAI() {
	return React.useContext(AIContext)
}
