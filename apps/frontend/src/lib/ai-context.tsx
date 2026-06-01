import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react"
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
	reloadSettings: () => Promise<void>
}

const AIContext = createContext<AIContextValue>({
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
	reloadSettings: async () => {},
})

export function AIProvider({ children }: { children: ReactNode }) {
	const [provider, setProvider] = useState<Provider>("anthropic")
	const [apiKey, setApiKey] = useState("")
	const [keyStatus, setKeyStatus] = useState<KeyStatus>("idle")
	const [quickModel, setQuickModel] = useState(DEFAULT_QUICK_MODEL.anthropic)
	const [detailedModel, setDetailedModel] = useState(
		DEFAULT_DETAILED_MODEL.anthropic,
	)

	async function loadSettings() {
		const s = await api.settings.get()
		const p = (s.ai.provider as Provider) || "anthropic"
		const detailed = s.ai.model || DEFAULT_DETAILED_MODEL[p]
		const quick = s.ai.quickModel || DEFAULT_QUICK_MODEL[p]
		const key = s.ai[`${p}Key` as "anthropicKey" | "openaiKey" | "googleKey" | "gatewayKey"] ?? ""
		setProvider(p)
		setDetailedModel(detailed)
		setQuickModel(quick)
		setApiKey(key)
		localStorage.setItem("askpat-provider", p)
		localStorage.setItem("askpat-quick-model", quick)
		localStorage.setItem(`ai-${p}-key`, key)
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: loadSettings is stable
	useEffect(() => { loadSettings() }, [])

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
		const keyField = `${provider}Key` as "anthropicKey" | "openaiKey" | "googleKey" | "gatewayKey"
		localStorage.removeItem(`ai-${provider}-key`)
		setApiKey("")
		setKeyStatus("idle")
		api.settings.update({ ai: { [keyField]: "" } })
	}

	function saveAiSettings(
		prov: Provider,
		key: string,
		quick: string,
		detailed: string,
	) {
		const keyField = `${prov}Key` as "anthropicKey" | "openaiKey" | "googleKey" | "gatewayKey"
		// Runtime cache for editor fetch callbacks
		localStorage.setItem(`ai-${prov}-key`, key)
		localStorage.setItem("askpat-provider", prov)
		localStorage.setItem("askpat-quick-model", quick)
		setProvider(prov)
		setApiKey(key)
		setQuickModel(quick)
		setDetailedModel(detailed)
		api.settings.update({ ai: { provider: prov, model: detailed, quickModel: quick, [keyField]: key } })
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
				reloadSettings: loadSettings,
			}}
		>
			{children}
		</AIContext.Provider>
	)
}

export function useAI() {
	return useContext(AIContext)
}
