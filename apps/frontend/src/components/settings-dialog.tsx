import {
	DEFAULT_PROMPT_AGENTPAT,
	DEFAULT_PROMPT_ASKPAT,
	DEFAULT_PROMPT_CONTEXT,
	DEFAULT_PROMPT_EXTRACTPAT,
} from "@patrickos/shared"
import { Check, Eye, EyeOff, Loader2 } from "lucide-react"
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react"
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog"
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
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"
import {
	CURATED_MODELS,
	DEFAULT_DETAILED_MODEL,
	DEFAULT_QUICK_MODEL,
	GATEWAY_DETAILED_MODELS,
	GATEWAY_QUICK_MODELS,
	type Provider,
} from "@/lib/ai-models"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type Section =
	| "account"
	| "ai-provider-local"
	| "ai-provider-byok"
	| "ai-provider-cloud"
	| "ai-instructions-context"
	| "ai-instructions-askpat"
	| "ai-instructions-agentpat"
	| "ai-instructions-extractpat"
	| "storage"
	| "billing"

type KeyStatus = "idle" | "verifying" | "valid" | "invalid"
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
			<div className="shrink-0 border-b px-6 py-4">
				<h2 className="text-lg font-semibold font-heading tracking-tight">
					{title}
				</h2>
				<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
			{footer && (
				<div className="flex shrink-0 items-center justify-between border-t px-6 py-3">
					{footer}
				</div>
			)}
		</>
	)
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

type NavItem = { id: Section; label: string; badge?: string; indent?: boolean }
type NavGroup = { label?: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
	{
		items: [{ id: "account", label: "You" }],
	},
	{
		label: "AI Provider",
		items: [
			{ id: "ai-provider-byok", label: "BYOK", indent: true },
			{ id: "ai-provider-local", label: "Local", badge: "Soon", indent: true },
			{ id: "ai-provider-cloud", label: "Cloud", badge: "Soon", indent: true },
		],
	},
	{
		label: "AI Instructions",
		items: [
			{
				id: "ai-instructions-context",
				label: "Practice Preferences",
				indent: true,
			},
			{ id: "ai-instructions-askpat", label: "AskPat", indent: true },
			{ id: "ai-instructions-agentpat", label: "AgentPat", indent: true },
			{ id: "ai-instructions-extractpat", label: "ExtractPat", indent: true },
		],
	},
	{
		label: "Misc",
		items: [
			{ id: "storage", label: "Storage" },
			{ id: "billing", label: "Billing" },
		],
	},
]

// ─── Provider config ──────────────────────────────────────────────────────────

const PROVIDER_OPTIONS: { id: Provider; name: string; description: string }[] =
	[
		{
			id: "anthropic",
			name: "Anthropic",
			description: "Direct API. Pay Anthropic.",
		},
		{ id: "openai", name: "OpenAI", description: "Direct API. Pay OpenAI." },
		{
			id: "gateway",
			name: "AI Gateway",
			description: "Multi-provider via Vercel.",
		},
	]

const PROVIDER_PLACEHOLDER: Record<Provider, string> = {
	anthropic: "sk-ant-...",
	openai: "sk-...",
	gateway: "aig_...",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsDialog({
	open,
	onOpenChange,
	savedProvider,
	keyStatus,
	savedQuickModel,
	savedDetailedModel,
	onVerify,
	onSave,
	onClear,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	savedProvider: Provider
	keyStatus: KeyStatus
	savedQuickModel: string
	savedDetailedModel: string
	onVerify: (provider: Provider, key: string) => void
	onSave: (
		provider: Provider,
		key: string,
		quick: string,
		detailed: string,
	) => void
	onClear: () => void
}) {
	const { theme, setTheme } = useTheme()
	const [activeSection, setActiveSection] = useState<Section>("account")

	// ── Account state ──────────────────────────────────────────────────────────
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

	// ── AI Provider state ──────────────────────────────────────────────────────
	const [tempProvider, setTempProvider] = useState<Provider>(savedProvider)
	const [tempKeys, setTempKeys] = useState<Record<Provider, string>>({
		gateway: "",
		anthropic: "",
		openai: "",
	})
	const [tempQuickModel, setTempQuickModel] = useState(savedQuickModel)
	const [tempDetailedModel, setTempDetailedModel] = useState(savedDetailedModel)
	const [showKey, setShowKey] = useState(false)
	const [savedProviderSnap, setSavedProviderSnap] = useState<{
		provider: Provider
		quickModel: string
		detailedModel: string
		key: string
	}>({
		provider: savedProvider,
		quickModel: savedQuickModel,
		detailedModel: savedDetailedModel,
		key: "",
	})

	// ── AI Instructions state ──────────────────────────────────────────────────
	const [practiceContext, setPracticeContext] = useState("")
	const [askPatInstructions, setAskPatInstructions] = useState("")
	const [agentPatInstructions, setAgentPatInstructions] = useState("")
	const [extractPatInstructions, setExtractPatInstructions] = useState("")
	const [savedPracticeContext, setSavedPracticeContext] = useState("")
	const [savedAskPat, setSavedAskPat] = useState("")
	const [savedAgentPat, setSavedAgentPat] = useState("")
	const [savedExtractPat, setSavedExtractPat] = useState("")

	// ── Sync on open ──────────────────────────────────────────────────────────
	useEffect(() => {
		if (!open) return
		api.settings.get().then((s) => {
			const resolvedProvider = (s.ai.provider as Provider) || savedProvider
			const resolvedDetailed = s.ai.model || savedDetailedModel
			const resolvedQuick = s.ai.quickModel || savedQuickModel
			const keys = {
				gateway: s.ai.gatewayKey ?? "",
				anthropic: s.ai.anthropicKey ?? "",
				openai: s.ai.openaiKey ?? "",
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

			setTempProvider(resolvedProvider)
			setTempDetailedModel(resolvedDetailed)
			setTempQuickModel(resolvedQuick)
			setTempKeys(keys)
			setSavedProviderSnap({
				provider: resolvedProvider,
				quickModel: resolvedQuick,
				detailedModel: resolvedDetailed,
				key: keys[resolvedProvider],
			})

			setPracticeContext(s.prompts.context)
			setSavedPracticeContext(s.prompts.context)
			setAskPatInstructions(s.prompts.askpat)
			setSavedAskPat(s.prompts.askpat)
			setAgentPatInstructions(s.prompts.agentpat)
			setSavedAgentPat(s.prompts.agentpat)
			setExtractPatInstructions(s.prompts.extractpat)
			setSavedExtractPat(s.prompts.extractpat)
		})
	}, [open, savedProvider, savedQuickModel, savedDetailedModel])

	// ── AI Provider handlers ───────────────────────────────────────────────────

	function handleProviderChange(p: Provider) {
		setTempProvider(p)
		const quickModels =
			p === "gateway" ? GATEWAY_QUICK_MODELS : CURATED_MODELS[p]
		const detailedModels =
			p === "gateway" ? GATEWAY_DETAILED_MODELS : CURATED_MODELS[p]
		if (!quickModels.some((m) => m.id === tempQuickModel))
			setTempQuickModel(DEFAULT_QUICK_MODEL[p])
		if (!detailedModels.some((m) => m.id === tempDetailedModel))
			setTempDetailedModel(DEFAULT_DETAILED_MODEL[p])
		onVerify(p, tempKeys[p])
	}

	const currentKey = tempKeys[tempProvider]

	const quickModelOptions = (
		tempProvider === "gateway"
			? GATEWAY_QUICK_MODELS
			: CURATED_MODELS[tempProvider]
	).map((m) => ({ value: m.id, label: m.name, pricingPerM: m.pricingPerM }))

	const detailedModelOptions = (
		tempProvider === "gateway"
			? GATEWAY_DETAILED_MODELS
			: CURATED_MODELS[tempProvider]
	).map((m) => ({ value: m.id, label: m.name, pricingPerM: m.pricingPerM }))

	// ── Dirty flags ───────────────────────────────────────────────────────────

	const isAccountDirty =
		name !== savedAccount.name ||
		firm !== savedAccount.firm ||
		role !== savedAccount.role ||
		jurisdiction !== savedAccount.jurisdiction

	const isProviderDirty =
		tempProvider !== savedProviderSnap.provider ||
		tempQuickModel !== savedProviderSnap.quickModel ||
		tempDetailedModel !== savedProviderSnap.detailedModel ||
		currentKey !== savedProviderSnap.key

	// ── Save handlers ─────────────────────────────────────────────────────────

	async function saveAccount() {
		await api.settings.update({ profile: { name, firm, role, jurisdiction } })
		setSavedAccount({ name, firm, role, jurisdiction })
	}

	async function saveProvider() {
		// onSave (ai-context.saveAiSettings) handles both React state and settings.yaml write
		onSave(tempProvider, currentKey, tempQuickModel, tempDetailedModel)
		setSavedProviderSnap({
			provider: tempProvider,
			quickModel: tempQuickModel,
			detailedModel: tempDetailedModel,
			key: currentKey,
		})
	}

	async function saveContext() {
		await api.settings.update({ prompts: { context: practiceContext } })
		setSavedPracticeContext(practiceContext)
	}
	async function saveAskPat() {
		await api.settings.update({ prompts: { askpat: askPatInstructions } })
		setSavedAskPat(askPatInstructions)
	}
	async function saveAgentPat() {
		await api.settings.update({ prompts: { agentpat: agentPatInstructions } })
		setSavedAgentPat(agentPatInstructions)
	}
	async function saveExtractPat() {
		await api.settings.update({ prompts: { extractpat: extractPatInstructions } })
		setSavedExtractPat(extractPatInstructions)
	}

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 md:max-h-[620px] md:max-w-[760px] lg:max-w-[900px]">
				<DialogTitle className="sr-only">Settings</DialogTitle>
				<DialogDescription className="sr-only">
					Configure PatrickOS.
				</DialogDescription>

				<SidebarProvider
					className="items-start"
					style={{ "--sidebar-width": "13rem" } as CSSProperties}
				>
					<Sidebar collapsible="none" className="hidden md:flex">
						<SidebarContent>
							{NAV_GROUPS.map((group, gi) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static nav
								<SidebarGroup key={gi}>
									{group.label && (
										<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
									)}
									<SidebarGroupContent>
										<SidebarMenu>
											{group.items.map((item) => {
												const isActive = activeSection === item.id
												return (
													<SidebarMenuItem key={item.id}>
														<SidebarMenuButton
															onClick={() =>
																!item.badge && setActiveSection(item.id)
															}
															disabled={!!item.badge}
															className={cn(
																"rounded-none text-sm",
																item.indent && "pl-5",
																isActive
																	? "border-l-2 border-primary font-medium"
																	: "border-l-2 border-transparent text-muted-foreground hover:text-foreground",
															)}
														>
															<span>{item.label}</span>
															{item.badge && (
																<span className="ml-auto text-[10px] text-muted-foreground">
																	{item.badge}
																</span>
															)}
														</SidebarMenuButton>
													</SidebarMenuItem>
												)
											})}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							))}
						</SidebarContent>
					</Sidebar>

					<main className="flex h-[580px] flex-1 flex-col overflow-hidden">
						{activeSection === "account" && (
							<AccountSection
								name={name}
								firm={firm}
								role={role}
								jurisdiction={jurisdiction}
								theme={theme}
								isDirty={isAccountDirty}
								onNameChange={setName}
								onFirmChange={setFirm}
								onRoleChange={setRole}
								onJurisdictionChange={setJurisdiction}
								onThemeChange={setTheme}
								onSave={saveAccount}
							/>
						)}
						{activeSection === "ai-provider-local" && (
							<SectionLayout
								title="Local"
								description="Run models on your own machine via Ollama."
							>
								<p className="text-xs text-muted-foreground">
									Local model support via Ollama — coming soon. Run Llama,
									Mistral, and other open models with no API costs and full data
									privacy.
								</p>
							</SectionLayout>
						)}
						{activeSection === "ai-provider-byok" && (
							<AiProviderByokSection
								tempProvider={tempProvider}
								currentKey={currentKey}
								showKey={showKey}
								keyStatus={keyStatus}
								tempQuickModel={tempQuickModel}
								tempDetailedModel={tempDetailedModel}
								quickModelOptions={quickModelOptions}
								detailedModelOptions={detailedModelOptions}
								isDirty={isProviderDirty}
								onProviderChange={handleProviderChange}
								onKeyChange={(v) =>
									setTempKeys((prev) => ({ ...prev, [tempProvider]: v }))
								}
								onShowKeyToggle={() => setShowKey((v) => !v)}
								onVerify={() => onVerify(tempProvider, currentKey)}
								onClear={() => {
									setTempKeys((prev) => ({ ...prev, [tempProvider]: "" }))
									onClear()
								}}
								onQuickModelChange={setTempQuickModel}
								onDetailedModelChange={setTempDetailedModel}
								onSave={saveProvider}
							/>
						)}
						{activeSection === "ai-provider-cloud" && (
							<SectionLayout
								title="Cloud"
								description="Buy AI credits directly from PatrickOS."
							>
								<p className="text-xs text-muted-foreground">
									PatrickOS Cloud credits — coming soon. One simple balance, no
									provider accounts or API keys needed.
								</p>
							</SectionLayout>
						)}
						{activeSection === "ai-instructions-context" && (
							<PromptSection
								title="Practice Preferences"
								description="Freeform context included in every AI call — prosecution style, specialisations, formatting preferences."
								defaultPrompt={DEFAULT_PROMPT_CONTEXT}
								value={practiceContext}
								savedValue={savedPracticeContext}
								onChange={setPracticeContext}
								onSave={saveContext}
							/>
						)}
						{activeSection === "ai-instructions-askpat" && (
							<PromptSection
								title="AskPat"
								description="In-editor writing assistant. Controls how it drafts and refines document content."
								defaultPrompt={DEFAULT_PROMPT_ASKPAT}
								value={askPatInstructions}
								savedValue={savedAskPat}
								onChange={setAskPatInstructions}
								onSave={saveAskPat}
								showAlert
							/>
						)}
						{activeSection === "ai-instructions-agentpat" && (
							<PromptSection
								title="AgentPat"
								description="Project-aware chat assistant. Controls how it reasons across your matter."
								defaultPrompt={DEFAULT_PROMPT_AGENTPAT}
								value={agentPatInstructions}
								savedValue={savedAgentPat}
								onChange={setAgentPatInstructions}
								onSave={saveAgentPat}
								showAlert
							/>
						)}
						{activeSection === "ai-instructions-extractpat" && (
							<PromptSection
								title="ExtractPat"
								description="PDF metadata extraction. Controls what fields are pulled from uploaded sources."
								defaultPrompt={DEFAULT_PROMPT_EXTRACTPAT}
								value={extractPatInstructions}
								savedValue={savedExtractPat}
								onChange={setExtractPatInstructions}
								onSave={saveExtractPat}
								showAlert
							/>
						)}
						{activeSection === "storage" && (
							<SectionLayout
								title="Storage"
								description="Where your projects, sources, and artifacts are stored."
							>
								<div className="flex flex-col gap-4">
									<div className="rounded-md border bg-muted/40 p-4">
										<p className="text-sm font-medium">Local storage</p>
										<p className="mt-1 text-xs text-muted-foreground">
											All data is stored as files on this device — JSON, YAML,
											and .docx. Nothing leaves your machine.
										</p>
									</div>
									<p className="text-xs text-muted-foreground">
										Cloud storage (Turso / self-hosted) — coming soon. Sync
										across devices and share with colleagues.
									</p>
								</div>
							</SectionLayout>
						)}
						{activeSection === "billing" && (
							<SectionLayout
								title="Billing"
								description="Subscription and usage for PatrickOS Cloud."
							>
								<p className="text-xs text-muted-foreground">
									PatrickOS is currently free. Cloud credits and team billing —
									coming soon.
								</p>
							</SectionLayout>
						)}
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	)
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection({
	name,
	firm,
	role,
	jurisdiction,
	theme,
	isDirty,
	onNameChange,
	onFirmChange,
	onRoleChange,
	onJurisdictionChange,
	onThemeChange,
	onSave,
}: {
	name: string
	firm: string
	role: string
	jurisdiction: string
	theme: string
	isDirty: boolean
	onNameChange: (v: string) => void
	onFirmChange: (v: string) => void
	onRoleChange: (v: string) => void
	onJurisdictionChange: (v: string) => void
	onThemeChange: (v: "light" | "dark" | "system") => void
	onSave: () => Promise<void>
}) {
	const { status, wrap } = useSaveButton()

	return (
		<SectionLayout
			title="You"
			description="Your profile and appearance settings."
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
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => onNameChange(e.target.value)}
							placeholder="Jane Smith"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="firm">Firm</Label>
						<Input
							id="firm"
							value={firm}
							onChange={(e) => onFirmChange(e.target.value)}
							placeholder="Smith & Associates IP"
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="role">Role</Label>
						<Input
							id="role"
							value={role}
							onChange={(e) => onRoleChange(e.target.value)}
							placeholder="Patent Attorney…"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="jurisdiction">Jurisdiction</Label>
						<Input
							id="jurisdiction"
							value={jurisdiction}
							onChange={(e) => onJurisdictionChange(e.target.value)}
							placeholder="USPTO, EPO…"
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="theme">Appearance</Label>
					<Select
						value={theme}
						onValueChange={(v) =>
							onThemeChange(v as "light" | "dark" | "system")
						}
					>
						<SelectTrigger id="theme">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="light">Light</SelectItem>
							<SelectItem value="dark">Dark</SelectItem>
							<SelectItem value="system">System</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
		</SectionLayout>
	)
}

// ─── AI Provider — BYOK ───────────────────────────────────────────────────────

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

function AiProviderByokSection({
	tempProvider,
	currentKey,
	showKey,
	keyStatus,
	tempQuickModel,
	tempDetailedModel,
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
	onSave,
}: {
	tempProvider: Provider
	currentKey: string
	showKey: boolean
	keyStatus: KeyStatus
	tempQuickModel: string
	tempDetailedModel: string
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
	onSave: () => Promise<void>
}) {
	const { status, wrap } = useSaveButton()

	return (
		<SectionLayout
			title="BYOK"
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
				<div className="grid grid-cols-3 gap-3">
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

				<div className="flex flex-col gap-4">
					<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
						Models
					</p>
					<div className="grid grid-cols-2 gap-4">
						<ModelSelect
							label="Quick Model"
							description="AskPat and ExtractPat — fast and cheap."
							value={tempQuickModel}
							options={quickModelOptions}
							onChange={onQuickModelChange}
						/>
						<ModelSelect
							label="Detailed Model"
							description="AgentPat — thorough, best reasoning."
							value={tempDetailedModel}
							options={detailedModelOptions}
							onChange={onDetailedModelChange}
						/>
					</div>
				</div>
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
}: {
	title: string
	description: string
	defaultPrompt?: string
	value: string
	savedValue: string
	onChange: (v: string) => void
	onSave: () => Promise<void>
	showAlert?: boolean
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
				<Textarea
					value={displayValue}
					onChange={(e) => onChange(e.target.value)}
					placeholder="Enter custom instructions…"
					className="min-h-[280px] font-mono text-xs"
				/>
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
