import type { AiEffort, SurfaceId } from "@patrickos/shared"
import {
	DEFAULT_PROMPT_CONTEXT,
	DEFAULT_TEMPLATE_AGENTPAT,
	DEFAULT_TEMPLATE_DRAFTPAT,
	DEFAULT_TEMPLATE_EXTRACTPAT,
	DEFAULT_TEMPLATE_NOTEPAT,
} from "@patrickos/shared"
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { PromptEditor } from "@/components/prompt-editor"
import { useTheme } from "@/components/theme-provider"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useAI } from "@/lib/ai-context"
import {
	DEFAULT_DETAILED_MODEL,
	DEFAULT_QUICK_MODEL,
	modelsForProvider,
	type Provider,
} from "@/lib/ai-models"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab =
	| "you"
	| "ai-byok"
	| "ai-epo"
	| "prompts-context"
	| "prompts-agent"
	| "prompts-draft"
	| "prompts-note"
	| "prompts-extract"
	| "appearance"

type SaveStatus = "idle" | "saving" | "saved"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useSaveButton() {
	const [status, setStatus] = useState<SaveStatus>("idle")
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

	useEffect(
		() => () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		},
		[],
	)

	async function wrap(fn: () => void | Promise<void>) {
		setStatus("saving")
		try {
			await fn()
			setStatus("saved")
			timerRef.current = setTimeout(() => setStatus("idle"), 2000)
		} catch {
			setStatus("idle")
		}
	}

	return { status, wrap }
}

function SaveButton({
	status,
	isDirty,
	onClick,
}: {
	status: SaveStatus
	isDirty: boolean
	onClick: () => void
}) {
	return (
		<Button
			onClick={onClick}
			disabled={!isDirty || status === "saving"}
			variant="outline"
		>
			{status === "saving" ? (
				<Loader2 size={12} className="animate-spin" />
			) : status === "saved" ? (
				<>
					<Check size={12} /> Saved
				</>
			) : (
				"Save"
			)}
		</Button>
	)
}

// ─── Section layout ───────────────────────────────────────────────────────────

function SectionLayout({
	title,
	description,
	children,
	footer,
}: {
	title: string
	description: string
	children: ReactNode
	footer?: ReactNode
}) {
	return (
		<>
			<div className="shrink-0 border-b px-8 py-5">
				<h2 className="text-lg font-semibold font-heading tracking-tight">
					{title}
				</h2>
				<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
			{footer && (
				<div className="flex shrink-0 items-center justify-between border-t px-8 py-3">
					{footer}
				</div>
			)}
		</>
	)
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const PROVIDER_OPTIONS: { id: Provider; name: string; description: string }[] =
	[
		{
			id: "anthropic",
			name: "Anthropic",
			description: "Direct API. Pay Anthropic.",
		},
		{ id: "openai", name: "OpenAI", description: "Direct API. Pay OpenAI." },
		{ id: "google", name: "Google", description: "Direct API. Pay Google." },
		{
			id: "gateway",
			name: "AI Gateway",
			description: "Multi-provider via Vercel.",
		},
	]

const PROVIDER_PLACEHOLDER: Record<Provider, string> = {
	anthropic: "sk-ant-...",
	openai: "sk-...",
	google: "AIza...",
	gateway: "aig_...",
}

type NavGroup = {
	label?: string
	items: { id: Tab; label: string; indent?: boolean }[]
}

const NAV_GROUPS: NavGroup[] = [
	{ items: [{ id: "you", label: "You" }] },
	{
		label: "AI",
		items: [
			{ id: "ai-byok", label: "Provider & Key", indent: true },
			{ id: "ai-epo", label: "EPO OPS", indent: true },
		],
	},
	{
		label: "Prompts",
		items: [
			{ id: "prompts-context", label: "Practice Context", indent: true },
			{ id: "prompts-agent", label: "AgentPat", indent: true },
			{ id: "prompts-draft", label: "DraftPat", indent: true },
			{ id: "prompts-note", label: "NotePat", indent: true },
			{ id: "prompts-extract", label: "ExtractPat", indent: true },
		],
	},
	{ items: [{ id: "appearance", label: "Appearance" }] },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsPanel({
	open,
	onClose,
	onSwitchProfile,
	taskPath,
}: {
	open: boolean
	onClose: () => void
	onSwitchProfile: () => void
	/** Active task path — used for live prompt-preview values. */
	taskPath?: string
}) {
	const ai = useAI()
	const { theme, setTheme } = useTheme()
	const [activeTab, setActiveTab] = useState<Tab>("you")

	// YOU
	const [name, setName] = useState("")
	const [firm, setFirm] = useState("")
	const [role, setRole] = useState("")
	const [jurisdiction, setJurisdiction] = useState("")
	const [savedAccount, setSavedAccount] = useState({
		name: "",
		firm: "",
		role: "",
		jurisdiction: "",
	})

	// AI
	const [tempProvider, setTempProvider] = useState<Provider>(ai.provider)
	const [tempKeys, setTempKeys] = useState<Record<Provider, string>>({
		gateway: "",
		anthropic: "",
		openai: "",
		google: "",
	})
	const [tempQuickModel, setTempQuickModel] = useState(ai.quickModel)
	const [tempDetailedModel, setTempDetailedModel] = useState(ai.detailedModel)
	const [tempEffort, setTempEffort] = useState<AiEffort>(ai.effort)
	const [tempShowThinking, setTempShowThinking] = useState(ai.showThinking)
	const [showKey, setShowKey] = useState(false)
	const [savedProviderSnap, setSavedProviderSnap] = useState({
		provider: ai.provider,
		quickModel: ai.quickModel,
		detailedModel: ai.detailedModel,
		effort: ai.effort,
		showThinking: ai.showThinking,
		key: "",
	})

	// Prompts
	const [practiceContext, setPracticeContext] = useState("")
	const [agentPatInstructions, setAgentPatInstructions] = useState("")
	const [draftPatInstructions, setDraftPatInstructions] = useState("")
	const [notePatInstructions, setNotePatInstructions] = useState("")
	const [extractPatInstructions, setExtractPatInstructions] = useState("")
	const [savedPracticeContext, setSavedPracticeContext] = useState("")
	const [savedAgentPat, setSavedAgentPat] = useState("")
	const [savedDraftPat, setSavedDraftPat] = useState("")
	const [savedNotePat, setSavedNotePat] = useState("")
	const [savedExtractPat, setSavedExtractPat] = useState("")

	// EPO
	const [epoKey, setEpoKey] = useState("")
	const [epoSecret, setEpoSecret] = useState("")
	const [savedEpoKey, setSavedEpoKey] = useState("")
	const [savedEpoSecret, setSavedEpoSecret] = useState("")

	// Load settings when opened
	useEffect(() => {
		if (!open) return
		api.settings.get().then((s) => {
			const p = (s.ai.provider as Provider) || ai.provider
			const detailed = s.ai.model || ai.detailedModel
			const quick = s.ai.quickModel || ai.quickModel
			const effort = s.ai.effort ?? ai.effort
			const showThinking = s.ai.showThinking ?? ai.showThinking
			const keys = {
				gateway: s.ai.gatewayKey ?? "",
				anthropic: s.ai.anthropicKey ?? "",
				openai: s.ai.openaiKey ?? "",
				google: s.ai.googleKey ?? "",
			}

			setName(s.profile.name)
			setFirm(s.profile.firm)
			setRole(s.profile.role)
			setJurisdiction(s.profile.jurisdiction)
			setSavedAccount({
				name: s.profile.name,
				firm: s.profile.firm,
				role: s.profile.role,
				jurisdiction: s.profile.jurisdiction,
			})

			setTempProvider(p)
			setTempDetailedModel(detailed)
			setTempQuickModel(quick)
			setTempEffort(effort)
			setTempShowThinking(showThinking)
			setTempKeys(keys)
			setSavedProviderSnap({
				provider: p,
				quickModel: quick,
				detailedModel: detailed,
				effort,
				showThinking,
				key: keys[p],
			})

			setPracticeContext(s.prompts.context)
			setSavedPracticeContext(s.prompts.context)
			setAgentPatInstructions(s.prompts.agentpat)
			setSavedAgentPat(s.prompts.agentpat)
			setDraftPatInstructions(s.prompts.draftpat)
			setSavedDraftPat(s.prompts.draftpat)
			setNotePatInstructions(s.prompts.notepat)
			setSavedNotePat(s.prompts.notepat)
			setExtractPatInstructions(s.prompts.extractpat)
			setSavedExtractPat(s.prompts.extractpat)
			setEpoKey(s.integrations?.epoOpsKey ?? "")
			setSavedEpoKey(s.integrations?.epoOpsKey ?? "")
			setEpoSecret(s.integrations?.epoOpsSecret ?? "")
			setSavedEpoSecret(s.integrations?.epoOpsSecret ?? "")
		})
	}, [
		open,
		ai.provider,
		ai.quickModel,
		ai.detailedModel,
		ai.effort,
		ai.showThinking,
	])

	// AI handlers
	const currentKey = tempKeys[tempProvider]

	function handleProviderChange(p: Provider) {
		setTempProvider(p)
		const models = modelsForProvider(p)
		if (!models.some((m) => m.id === tempQuickModel))
			setTempQuickModel(DEFAULT_QUICK_MODEL[p])
		if (!models.some((m) => m.id === tempDetailedModel))
			setTempDetailedModel(DEFAULT_DETAILED_MODEL[p])
		ai.verifyKey(p, tempKeys[p])
	}

	// Same catalogue for both selects; gateway flattens all vendors' models.
	const modelOptions = modelsForProvider(tempProvider).map((m) => ({
		value: m.id,
		label: m.name,
		pricingPerM: m.pricingPerM,
	}))
	const quickModelOptions = modelOptions
	const detailedModelOptions = modelOptions

	// Dirty flags
	const isAccountDirty =
		name !== savedAccount.name ||
		firm !== savedAccount.firm ||
		role !== savedAccount.role ||
		jurisdiction !== savedAccount.jurisdiction

	const isProviderDirty =
		tempProvider !== savedProviderSnap.provider ||
		tempQuickModel !== savedProviderSnap.quickModel ||
		tempDetailedModel !== savedProviderSnap.detailedModel ||
		tempEffort !== savedProviderSnap.effort ||
		tempShowThinking !== savedProviderSnap.showThinking ||
		currentKey !== savedProviderSnap.key

	// Save handlers
	async function saveAccount() {
		await api.settings.update({ profile: { name, firm, role, jurisdiction } })
		setSavedAccount({ name, firm, role, jurisdiction })
	}

	async function saveProvider() {
		ai.saveAiSettings(
			tempProvider,
			currentKey,
			tempQuickModel,
			tempDetailedModel,
			tempEffort,
			tempShowThinking,
		)
		setSavedProviderSnap({
			provider: tempProvider,
			quickModel: tempQuickModel,
			detailedModel: tempDetailedModel,
			effort: tempEffort,
			showThinking: tempShowThinking,
			key: currentKey,
		})
	}

	async function saveContext() {
		await api.settings.update({ prompts: { context: practiceContext } })
		setSavedPracticeContext(practiceContext)
	}
	async function saveAgentPat() {
		await api.settings.update({ prompts: { agentpat: agentPatInstructions } })
		setSavedAgentPat(agentPatInstructions)
	}
	async function saveDraftPat() {
		await api.settings.update({ prompts: { draftpat: draftPatInstructions } })
		setSavedDraftPat(draftPatInstructions)
	}
	async function saveNotePat() {
		await api.settings.update({ prompts: { notepat: notePatInstructions } })
		setSavedNotePat(notePatInstructions)
	}
	async function saveExtractPat() {
		await api.settings.update({
			prompts: { extractpat: extractPatInstructions },
		})
		setSavedExtractPat(extractPatInstructions)
	}
	async function saveEpo() {
		await api.settings.update({
			integrations: { epoOpsKey: epoKey, epoOpsSecret: epoSecret },
		})
		setSavedEpoKey(epoKey)
		setSavedEpoSecret(epoSecret)
	}

	function handleSwitchProfile() {
		onClose()
		onSwitchProfile()
	}

	return (
		<div
			className={cn(
				"fixed inset-0 z-50 bg-background flex transition-opacity duration-200",
				open ? "opacity-100" : "opacity-0 pointer-events-none",
			)}
		>
			{/* Sidebar */}
			<div className="w-52 border-r flex flex-col shrink-0">
				<div className="px-5 py-4 border-b">
					<p className="text-sm font-semibold font-heading">Settings</p>
				</div>
				<nav className="flex-1 overflow-y-auto p-2">
					{NAV_GROUPS.map((group, gi) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static nav
						<div key={gi} className={gi > 0 ? "mt-3" : ""}>
							{group.label && (
								<p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
									{group.label}
								</p>
							)}
							{group.items.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => setActiveTab(item.id)}
									className={cn(
										"w-full rounded text-left px-2 py-1.5 text-sm transition-colors",
										item.indent && "pl-4",
										activeTab === item.id
											? "bg-accent text-accent-foreground font-medium"
											: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
									)}
								>
									{item.label}
								</button>
							))}
						</div>
					))}
				</nav>
				<div className="p-3 border-t">
					<button
						type="button"
						onClick={handleSwitchProfile}
						className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded transition-colors"
					>
						Switch profile…
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Top bar */}
				<div className="flex items-center justify-end border-b px-4 py-2 shrink-0">
					<Button type="button" variant="ghost" size="icon" onClick={onClose}>
						<X size={16} />
					</Button>
				</div>

				{/* Active section */}
				<div className="flex flex-col flex-1 overflow-hidden">
					{activeTab === "you" && (
						<YouSection
							name={name}
							firm={firm}
							role={role}
							jurisdiction={jurisdiction}
							isDirty={isAccountDirty}
							onNameChange={setName}
							onFirmChange={setFirm}
							onRoleChange={setRole}
							onJurisdictionChange={setJurisdiction}
							onSave={saveAccount}
						/>
					)}
					{activeTab === "ai-byok" && (
						<ByokSection
							tempProvider={tempProvider}
							currentKey={currentKey}
							showKey={showKey}
							keyStatus={ai.keyStatus}
							tempQuickModel={tempQuickModel}
							tempDetailedModel={tempDetailedModel}
							tempEffort={tempEffort}
							tempShowThinking={tempShowThinking}
							quickModelOptions={quickModelOptions}
							detailedModelOptions={detailedModelOptions}
							isDirty={isProviderDirty}
							onProviderChange={handleProviderChange}
							onEffortChange={setTempEffort}
							onShowThinkingChange={setTempShowThinking}
							onKeyChange={(v) =>
								setTempKeys((prev) => ({ ...prev, [tempProvider]: v }))
							}
							onShowKeyToggle={() => setShowKey((v) => !v)}
							onVerify={() => ai.verifyKey(tempProvider, currentKey)}
							onClear={() => {
								setTempKeys((prev) => ({ ...prev, [tempProvider]: "" }))
								ai.clearApiKey()
							}}
							onQuickModelChange={setTempQuickModel}
							onDetailedModelChange={setTempDetailedModel}
							onSave={saveProvider}
						/>
					)}
					{activeTab === "ai-epo" && (
						<EpoSection
							epoKey={epoKey}
							epoSecret={epoSecret}
							savedKey={savedEpoKey}
							savedSecret={savedEpoSecret}
							onKeyChange={setEpoKey}
							onSecretChange={setEpoSecret}
							onSave={saveEpo}
						/>
					)}
					{activeTab === "prompts-context" && (
						<PromptSection
							title="Practice Context"
							description="Freeform context included in every AI call — prosecution style, specialisations, formatting preferences."
							defaultPrompt={DEFAULT_PROMPT_CONTEXT}
							value={practiceContext}
							savedValue={savedPracticeContext}
							onChange={setPracticeContext}
							onSave={saveContext}
						/>
					)}
					{activeTab === "prompts-agent" && (
						<PromptSection
							title="AgentPat"
							description="Task-aware research assistant. The full system-prompt template — edit any part; <TOKENS> inject live context and wire tools."
							defaultPrompt={DEFAULT_TEMPLATE_AGENTPAT}
							value={agentPatInstructions}
							savedValue={savedAgentPat}
							onChange={setAgentPatInstructions}
							onSave={saveAgentPat}
							surface="agentpat"
							taskPath={taskPath}
							showAlert
						/>
					)}
					{activeTab === "prompts-draft" && (
						<PromptSection
							title="DraftPat"
							description="In-editor writing assistant for artifacts. The full template controlling how it drafts and refines document content."
							defaultPrompt={DEFAULT_TEMPLATE_DRAFTPAT}
							value={draftPatInstructions}
							savedValue={savedDraftPat}
							onChange={setDraftPatInstructions}
							onSave={saveDraftPat}
							surface="draftpat"
							taskPath={taskPath}
							showAlert
						/>
					)}
					{activeTab === "prompts-note" && (
						<PromptSection
							title="NotePat"
							description="In-editor assistant for per-source Notes. The full template; <CURRENTSOURCE> makes it aware of the document the note belongs to."
							defaultPrompt={DEFAULT_TEMPLATE_NOTEPAT}
							value={notePatInstructions}
							savedValue={savedNotePat}
							onChange={setNotePatInstructions}
							onSave={saveNotePat}
							surface="notepat"
							taskPath={taskPath}
							showAlert
						/>
					)}
					{activeTab === "prompts-extract" && (
						<PromptSection
							title="ExtractPat"
							description="Structured PDF extraction. The full template — keep <LOCATIONINSTRUCTION> and the field guidance, or extraction may break."
							defaultPrompt={DEFAULT_TEMPLATE_EXTRACTPAT}
							value={extractPatInstructions}
							savedValue={savedExtractPat}
							onChange={setExtractPatInstructions}
							onSave={saveExtractPat}
							surface="extractpat"
							taskPath={taskPath}
							showAlert
						/>
					)}
					{activeTab === "appearance" && (
						<AppearanceSection theme={theme} onThemeChange={setTheme} />
					)}
				</div>
			</div>
		</div>
	)
}

// ─── You section ──────────────────────────────────────────────────────────────

function YouSection({
	name,
	firm,
	role,
	jurisdiction,
	isDirty,
	onNameChange,
	onFirmChange,
	onRoleChange,
	onJurisdictionChange,
	onSave,
}: {
	name: string
	firm: string
	role: string
	jurisdiction: string
	isDirty: boolean
	onNameChange: (v: string) => void
	onFirmChange: (v: string) => void
	onRoleChange: (v: string) => void
	onJurisdictionChange: (v: string) => void
	onSave: () => Promise<void>
}) {
	const { status, wrap } = useSaveButton()

	return (
		<SectionLayout
			title="You"
			description="Your name and firm appear in AI-drafted documents."
			footer={
				<>
					<div />
					<SaveButton
						status={status}
						isDirty={isDirty}
						onClick={() => wrap(onSave)}
					/>
				</>
			}
		>
			<div className="flex flex-col gap-4 max-w-sm">
				<div className="grid grid-cols-2 gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="s-name">Name</Label>
						<Input
							id="s-name"
							value={name}
							onChange={(e) => onNameChange(e.target.value)}
							placeholder="Jane Smith"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="s-firm">Firm</Label>
						<Input
							id="s-firm"
							value={firm}
							onChange={(e) => onFirmChange(e.target.value)}
							placeholder="Smith & Associates IP"
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="s-role">Role</Label>
						<Input
							id="s-role"
							value={role}
							onChange={(e) => onRoleChange(e.target.value)}
							placeholder="Patent Attorney"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="s-jur">Jurisdiction</Label>
						<Input
							id="s-jur"
							value={jurisdiction}
							onChange={(e) => onJurisdictionChange(e.target.value)}
							placeholder="USPTO, EPO…"
						/>
					</div>
				</div>
			</div>
		</SectionLayout>
	)
}

// ─── BYOK section ─────────────────────────────────────────────────────────────

function ModelSelect({
	label,
	description,
	value,
	options,
	onChange,
}: {
	label: string
	description: string
	value: string
	options: {
		value: string
		label: string
		pricingPerM?: { input: number; output: number }
	}[]
	onChange: (v: string) => void
}) {
	const selected = options.find((o) => o.value === value)
	return (
		<div className="flex flex-col gap-1.5">
			<Label>{label}</Label>
			<p className="text-xs text-muted-foreground">{description}</p>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{selected?.pricingPerM && (
				<p className="text-xs tabular-nums text-muted-foreground">
					${selected.pricingPerM.input.toFixed(2)} in · $
					{selected.pricingPerM.output.toFixed(2)} out per M tokens
				</p>
			)}
		</div>
	)
}

function ByokSection({
	tempProvider,
	currentKey,
	showKey,
	keyStatus,
	tempQuickModel,
	tempDetailedModel,
	tempEffort,
	tempShowThinking,
	quickModelOptions,
	detailedModelOptions,
	isDirty,
	onProviderChange,
	onKeyChange,
	onShowKeyToggle,
	onVerify,
	onClear,
	onQuickModelChange,
	onDetailedModelChange,
	onEffortChange,
	onShowThinkingChange,
	onSave,
}: {
	tempProvider: Provider
	currentKey: string
	showKey: boolean
	keyStatus: "idle" | "verifying" | "valid" | "invalid"
	tempQuickModel: string
	tempDetailedModel: string
	tempEffort: AiEffort
	tempShowThinking: boolean
	quickModelOptions: {
		value: string
		label: string
		pricingPerM?: { input: number; output: number }
	}[]
	detailedModelOptions: {
		value: string
		label: string
		pricingPerM?: { input: number; output: number }
	}[]
	isDirty: boolean
	onProviderChange: (p: Provider) => void
	onKeyChange: (v: string) => void
	onShowKeyToggle: () => void
	onVerify: () => void
	onClear: () => void
	onQuickModelChange: (v: string) => void
	onDetailedModelChange: (v: string) => void
	onEffortChange: (v: AiEffort) => void
	onShowThinkingChange: (v: boolean) => void
	onSave: () => Promise<void>
}) {
	const { status, wrap } = useSaveButton()

	return (
		<SectionLayout
			title="Provider & Key"
			description="Bring your own API key. Stored in settings.yaml on your machine — never sent to our servers."
			footer={
				<>
					<div />
					<SaveButton
						status={status}
						isDirty={isDirty}
						onClick={() => wrap(onSave)}
					/>
				</>
			}
		>
			<div className="flex flex-col gap-6 max-w-md">
				<div className="grid grid-cols-4 gap-3">
					{PROVIDER_OPTIONS.map((p) => (
						<button
							key={p.id}
							type="button"
							onClick={() => onProviderChange(p.id)}
							className={cn(
								"rounded-lg border p-3 text-left transition-colors",
								tempProvider === p.id
									? "border-primary bg-primary/5 ring-1 ring-primary"
									: "hover:border-foreground/20 hover:bg-muted/50",
							)}
						>
							<p className="text-sm font-medium">{p.name}</p>
							<p className="text-xs text-muted-foreground">{p.description}</p>
						</button>
					))}
				</div>

				<div className="flex flex-col gap-1.5">
					<Label>API Key</Label>
					<div className="flex gap-1.5">
						<div className="relative flex-1">
							<Input
								type={showKey ? "text" : "password"}
								value={currentKey}
								onChange={(e) => onKeyChange(e.target.value)}
								placeholder={PROVIDER_PLACEHOLDER[tempProvider]}
								className="pr-8"
							/>
							<Button
								variant="ghost"
								size="icon-xs"
								type="button"
								className="absolute right-1 top-1/2 -translate-y-1/2"
								onClick={onShowKeyToggle}
							>
								{showKey ? <EyeOff size={12} /> : <Eye size={12} />}
							</Button>
						</div>
						<Button
							variant="secondary"
							onClick={onVerify}
							disabled={!currentKey || keyStatus === "verifying"}
						>
							{keyStatus === "verifying" ? (
								<Loader2 size={12} className="animate-spin" />
							) : (
								"Verify"
							)}
						</Button>
						{currentKey && (
							<Button variant="destructive" onClick={onClear}>
								Clear
							</Button>
						)}
					</div>
					{keyStatus !== "idle" && (
						<p
							className={cn(
								"text-xs",
								keyStatus === "valid" && "text-green-600",
								keyStatus === "invalid" && "text-destructive",
								keyStatus === "verifying" && "text-muted-foreground",
							)}
						>
							{keyStatus === "valid" && "✓ Connected"}
							{keyStatus === "invalid" && "Invalid key — check and try again"}
							{keyStatus === "verifying" && "Verifying…"}
						</p>
					)}
				</div>

				<Separator />

				<div className="grid grid-cols-2 gap-4">
					<ModelSelect
						label="Quick model"
						description="DraftPat, NotePat and ExtractPat — fast and cheap."
						value={tempQuickModel}
						options={quickModelOptions}
						onChange={onQuickModelChange}
					/>
					<ModelSelect
						label="Detailed model"
						description="AgentPat — thorough, best reasoning."
						value={tempDetailedModel}
						options={detailedModelOptions}
						onChange={onDetailedModelChange}
					/>
				</div>

				<Separator />

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label>AgentPat reasoning</Label>
						<p className="text-xs text-muted-foreground">
							How hard AgentPat thinks before answering. Higher is more thorough
							but slower and pricier. (Quick model and extraction always run at
							low effort.)
						</p>
						<Select
							value={tempEffort}
							onValueChange={(v) => onEffortChange(v as AiEffort)}
						>
							<SelectTrigger className="w-40">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="low">Low — fastest</SelectItem>
								<SelectItem value="medium">Medium — balanced</SelectItem>
								<SelectItem value="high">High — thorough</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="flex items-start gap-2.5">
						<Checkbox
							id="show-thinking"
							checked={tempShowThinking}
							onCheckedChange={(v) => onShowThinkingChange(v === true)}
							className="mt-0.5"
						/>
						<Label
							htmlFor="show-thinking"
							className="flex flex-col gap-0.5 cursor-pointer"
						>
							<span className="text-sm font-medium">Show thinking</span>
							<span className="text-xs font-normal text-muted-foreground">
								Surface the model's reasoning in the chat. Adds latency and
								cost.
							</span>
						</Label>
					</div>
				</div>
			</div>
		</SectionLayout>
	)
}

// ─── EPO section ──────────────────────────────────────────────────────────────

function EpoSection({
	epoKey,
	epoSecret,
	savedKey,
	savedSecret,
	onKeyChange,
	onSecretChange,
	onSave,
}: {
	epoKey: string
	epoSecret: string
	savedKey: string
	savedSecret: string
	onKeyChange: (v: string) => void
	onSecretChange: (v: string) => void
	onSave: () => Promise<void>
}) {
	const { status, wrap } = useSaveButton()
	const isDirty = epoKey !== savedKey || epoSecret !== savedSecret

	return (
		<SectionLayout
			title="EPO OPS"
			description="Fetch patent data directly from the European Patent Office. Register at developers.epo.org."
			footer={
				<>
					<div />
					<SaveButton
						status={status}
						isDirty={isDirty}
						onClick={() => wrap(onSave)}
					/>
				</>
			}
		>
			<div className="flex flex-col gap-4 max-w-sm">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="epo-key">Consumer Key</Label>
					<Input
						id="epo-key"
						value={epoKey}
						onChange={(e) => onKeyChange(e.target.value)}
						placeholder="your-consumer-key"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="epo-secret">Consumer Secret</Label>
					<Input
						id="epo-secret"
						type="password"
						value={epoSecret}
						onChange={(e) => onSecretChange(e.target.value)}
						placeholder="your-consumer-secret"
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					When set, AgentPat gains a{" "}
					<code className="font-mono">fetchPatent</code> tool — ask it to look
					up any publication number (EP, US, WO, etc.).
				</p>
			</div>
		</SectionLayout>
	)
}

// ─── Prompt section ───────────────────────────────────────────────────────────

function PromptSection({
	title,
	description,
	defaultPrompt,
	value,
	savedValue,
	onChange,
	onSave,
	showAlert = false,
	surface,
	taskPath,
}: {
	title: string
	description: string
	defaultPrompt?: string
	value: string
	savedValue: string
	onChange: (v: string) => void
	onSave: () => Promise<void>
	showAlert?: boolean
	/** When set, edit as a full <TOKEN> template (PromptEditor); else plain text. */
	surface?: SurfaceId
	taskPath?: string
}) {
	const [alertOpen, setAlertOpen] = useState(false)
	const { status, wrap } = useSaveButton()

	const displayValue = value || defaultPrompt || ""
	const savedDisplayValue = savedValue || defaultPrompt || ""
	const isDirty = displayValue !== savedDisplayValue

	return (
		<>
			<SectionLayout
				title={title}
				description={description}
				footer={
					<>
						{defaultPrompt ? (
							<Button
								variant="destructive"
								onClick={() => onChange(defaultPrompt)}
							>
								Reset to default
							</Button>
						) : (
							<div />
						)}
						<SaveButton
							status={status}
							isDirty={isDirty}
							onClick={() => (showAlert ? setAlertOpen(true) : wrap(onSave))}
						/>
					</>
				}
			>
				{surface ? (
					<PromptEditor
						surface={surface}
						value={displayValue}
						onChange={onChange}
						taskPath={taskPath}
					/>
				) : (
					<Textarea
						value={displayValue}
						onChange={(e) => onChange(e.target.value)}
						placeholder="Enter custom instructions…"
						className="min-h-[320px] font-mono text-xs"
					/>
				)}
			</SectionLayout>

			{showAlert && (
				<AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								Changing AI persona instructions
							</AlertDialogTitle>
							<AlertDialogDescription>
								Editing the system prompt can materially change how this AI
								persona behaves. Poorly structured instructions may degrade
								response quality.{" "}
								<a
									href="https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview"
									className="underline hover:opacity-80"
									target="_blank"
									rel="noopener noreferrer"
								>
									Anthropic prompt engineering
								</a>{" "}
								&amp;{" "}
								<a
									href="https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api"
									className="underline hover:opacity-80"
									target="_blank"
									rel="noopener noreferrer"
								>
									OpenAI best practices
								</a>
								.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={() => {
									setAlertOpen(false)
									wrap(onSave)
								}}
							>
								Save anyway
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</>
	)
}

// ─── Appearance section ───────────────────────────────────────────────────────

function AppearanceSection({
	theme,
	onThemeChange,
}: {
	theme: string
	onThemeChange: (v: "light" | "dark" | "system") => void
}) {
	return (
		<SectionLayout
			title="Appearance"
			description="Visual theme. Deeper theming and accessibility options coming soon."
		>
			<div className="flex flex-col gap-1.5 max-w-xs">
				<Label htmlFor="s-theme">Theme</Label>
				<Select
					value={theme}
					onValueChange={(v) => onThemeChange(v as "light" | "dark" | "system")}
				>
					<SelectTrigger id="s-theme">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="light">Light</SelectItem>
						<SelectItem value="dark">Dark</SelectItem>
						<SelectItem value="system">System</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</SectionLayout>
	)
}
