import {
	DEFAULT_PROMPT_AGENTPAT,
	DEFAULT_PROMPT_ASKPAT,
	DEFAULT_PROMPT_CONTEXT,
	DEFAULT_PROMPT_EXTRACTPAT,
} from "@patrickos/db"
import {
	Check,
	Clover,
	CreditCard,
	Database,
	Eye,
	EyeOff,
	Loader2,
	MessageSquare,
	RotateCcw,
	User
} from "lucide-react"
import {
	type CSSProperties,
	type ElementType,
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
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
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
	| "ai-provider"
	| "ai-provider-local"
	| "ai-provider-byok"
	| "ai-provider-cloud"
	| "ai-instructions"
	| "ai-instructions-context"
	| "ai-instructions-askpat"
	| "ai-instructions-agentpat"
	| "ai-instructions-extractpat"
	| "storage"
	| "billing"

type KeyStatus = "idle" | "verifying" | "valid" | "invalid"

type SaveStatus = "idle" | "saving" | "saved"

// ─── useSaveButton ────────────────────────────────────────────────────────────

function useSaveButton() {
	const [status, setStatus] = useState<SaveStatus>("idle")
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [])

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

// ─── SaveButton ───────────────────────────────────────────────────────────────

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
			size="sm"
			onClick={onClick}
			disabled={!isDirty || status === "saving"}
		>
			{status === "saving" ? (
				<>
					<Loader2 size={12} className="animate-spin" />
					Saving…
				</>
			) : status === "saved" ? (
				<>
					<Check size={12} />
					Saved
				</>
			) : (
				"Save"
			)}
		</Button>
	)
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

type NavItem = {
	id: Section
	label: string
	icon: ElementType
	children?: { id: Section; label: string }[]
}

const NAV: NavItem[] = [
	{ id: "account", label: "You", icon: User },
	{
		id: "ai-provider",
		label: "AI Provider",
		icon: Clover,
		children: [
			{ id: "ai-provider-local", label: "Local" },
			{ id: "ai-provider-byok", label: "BYOK" },
			{ id: "ai-provider-cloud", label: "Cloud" },
		],
	},
	{
		id: "ai-instructions",
		label: "AI Instructions",
		icon: MessageSquare,
		children: [
			{ id: "ai-instructions-context", label: "Practice Preferences" },
			{ id: "ai-instructions-askpat", label: "AskPat" },
			{ id: "ai-instructions-agentpat", label: "AgentPat" },
			{ id: "ai-instructions-extractpat", label: "ExtractPat" },
		],
	},
	{ id: "storage", label: "Storage", icon: Database },
	{ id: "billing", label: "Billing", icon: CreditCard },
]

function getBreadcrumb(section: Section): {
	parent?: { label: string; id: Section }
	current: string
} {
	if (section === "ai-provider-local")
		return {
			parent: { label: "AI Provider", id: "ai-provider" },
			current: "Local",
		}
	if (section === "ai-provider-byok")
		return {
			parent: { label: "AI Provider", id: "ai-provider" },
			current: "BYOK",
		}
	if (section === "ai-provider-cloud")
		return {
			parent: { label: "AI Provider", id: "ai-provider" },
			current: "Cloud",
		}
	if (section === "ai-instructions-context")
		return {
			parent: { label: "AI Instructions", id: "ai-instructions" },
			current: "Practice Preferences",
		}
	if (section === "ai-instructions-askpat")
		return {
			parent: { label: "AI Instructions", id: "ai-instructions" },
			current: "AskPat",
		}
	if (section === "ai-instructions-agentpat")
		return {
			parent: { label: "AI Instructions", id: "ai-instructions" },
			current: "AgentPat",
		}
	if (section === "ai-instructions-extractpat")
		return {
			parent: { label: "AI Instructions", id: "ai-instructions" },
			current: "ExtractPat",
		}
	if (section === "account") return { current: "You" }
	const item = NAV.find((n) => n.id === section)
	return { current: item?.label ?? "" }
}

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

	// ── Account saved snapshot (for dirty tracking) ────────────────────────────
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

	// ── Provider saved snapshot (for dirty tracking) ───────────────────────────
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

	// ── Prompt saved snapshots (for dirty tracking) ────────────────────────────
	const [savedPracticeContext, setSavedPracticeContext] = useState("")
	const [savedAskPat, setSavedAskPat] = useState("")
	const [savedAgentPat, setSavedAgentPat] = useState("")
	const [savedExtractPat, setSavedExtractPat] = useState("")

	// ── Sync on open ──────────────────────────────────────────────────────────
	useEffect(() => {
		if (!open) return
		setTempProvider(savedProvider)
		setTempQuickModel(savedQuickModel)
		setTempDetailedModel(savedDetailedModel)
		const keys = {
			gateway: localStorage.getItem("ai-gateway-key") ?? "",
			anthropic: localStorage.getItem("ai-anthropic-key") ?? "",
			openai: localStorage.getItem("ai-openai-key") ?? "",
		}
		setTempKeys(keys)
		setSavedProviderSnap({
			provider: savedProvider,
			quickModel: savedQuickModel,
			detailedModel: savedDetailedModel,
			key: keys[savedProvider],
		})

		api.settings.get().then((s) => {
			setName(s.name)
			setFirm(s.firm)
			setRole(s.role)
			setJurisdiction(s.jurisdiction)
			setSavedAccount({
				name: s.name,
				firm: s.firm,
				role: s.role,
				jurisdiction: s.jurisdiction,
			})

			const resolvedProvider = (s.aiProvider as Provider) ?? savedProvider
			const resolvedQuick = s.aiQuickModel ?? savedQuickModel
			const resolvedDetailed = s.aiDetailedModel ?? savedDetailedModel
			if (s.aiProvider) setTempProvider(resolvedProvider)
			if (s.aiQuickModel) setTempQuickModel(resolvedQuick)
			if (s.aiDetailedModel) setTempDetailedModel(resolvedDetailed)
			setSavedProviderSnap({
				provider: resolvedProvider,
				quickModel: resolvedQuick,
				detailedModel: resolvedDetailed,
				key: keys[resolvedProvider],
			})

			setPracticeContext(s.promptContext)
			setSavedPracticeContext(s.promptContext)
			setAskPatInstructions(s.promptAskpat)
			setSavedAskPat(s.promptAskpat)
			setAgentPatInstructions(s.promptAgentpat)
			setSavedAgentPat(s.promptAgentpat)
			setExtractPatInstructions(s.promptExtractpat)
			setSavedExtractPat(s.promptExtractpat)
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
		// Reset key status: verify new provider's key (or reset to idle if none)
		onVerify(p, tempKeys[p])
	}

	async function handleVerify() {
		const key = tempKeys[tempProvider]
		await onVerify(tempProvider, key)
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
		await api.settings.update({ name, firm, role, jurisdiction })
		setSavedAccount({ name, firm, role, jurisdiction })
	}

	async function saveProvider() {
		onSave(tempProvider, currentKey, tempQuickModel, tempDetailedModel)
		await api.settings.update({
			aiProvider: tempProvider,
			aiQuickModel: tempQuickModel,
			aiDetailedModel: tempDetailedModel,
		})
		setSavedProviderSnap({
			provider: tempProvider,
			quickModel: tempQuickModel,
			detailedModel: tempDetailedModel,
			key: currentKey,
		})
	}

	async function saveContext() {
		await api.settings.update({ promptContext: practiceContext })
		setSavedPracticeContext(practiceContext)
	}

	async function saveAskPat() {
		await api.settings.update({ promptAskpat: askPatInstructions })
		setSavedAskPat(askPatInstructions)
	}

	async function saveAgentPat() {
		await api.settings.update({ promptAgentpat: agentPatInstructions })
		setSavedAgentPat(agentPatInstructions)
	}

	async function saveExtractPat() {
		await api.settings.update({ promptExtractpat: extractPatInstructions })
		setSavedExtractPat(extractPatInstructions)
	}

	const breadcrumb = getBreadcrumb(activeSection)
	const breadcrumbParent = breadcrumb.parent

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 md:max-h-[580px] md:max-w-[760px] lg:max-w-[900px]">
				<DialogTitle className="sr-only">Settings</DialogTitle>
				<DialogDescription className="sr-only">
					Configure PatrickOS.
				</DialogDescription>
				<SidebarProvider
					className="items-start"
					style={{ "--sidebar-width": "13rem" } as CSSProperties}
				>
					<Sidebar collapsible="none" className="hidden md:flex">
						<SidebarHeader>
							<h2 className="text-lg font-semibold font-heading">Settings</h2>
						</SidebarHeader>
						<SidebarContent>
							<SidebarGroup>
								<SidebarGroupContent>
									<SidebarMenu>
										{NAV.map((item) =>
											item.children ? (
												<SidebarMenuItem key={item.id}>
													<SidebarMenuButton
														isActive={activeSection === item.id}
														onClick={() => setActiveSection(item.id)}
													>
														<item.icon />
														<span>{item.label}</span>
													</SidebarMenuButton>
													<SidebarMenuSub>
														{item.children.map((child) => (
															<SidebarMenuSubItem key={child.id}>
																<SidebarMenuSubButton
																	isActive={activeSection === child.id}
																	onClick={() => setActiveSection(child.id)}
																>
																	{child.label}
																</SidebarMenuSubButton>
															</SidebarMenuSubItem>
														))}
													</SidebarMenuSub>
												</SidebarMenuItem>
											) : (
												<SidebarMenuItem key={item.id}>
													<SidebarMenuButton
														isActive={activeSection === item.id}
														onClick={() => setActiveSection(item.id)}
													>
														<item.icon />
														<span>{item.label}</span>
													</SidebarMenuButton>
												</SidebarMenuItem>
											),
										)}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						</SidebarContent>
					</Sidebar>

					<main className="flex h-[560px] flex-1 flex-col overflow-hidden">
						<header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
							<Breadcrumb>
								<BreadcrumbList>
									<BreadcrumbItem>
										<span className="text-sm text-muted-foreground">
											Settings
										</span>
									</BreadcrumbItem>
									{breadcrumbParent && (
										<>
											<BreadcrumbSeparator />
											<BreadcrumbItem>
												<button
													type="button"
													className="text-sm text-muted-foreground hover:text-foreground"
													onClick={() => setActiveSection(breadcrumbParent.id)}
												>
													{breadcrumbParent.label}
												</button>
											</BreadcrumbItem>
										</>
									)}
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>{breadcrumb.current}</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</header>

						<div className="flex flex-1 flex-col overflow-y-auto p-6">
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
							{activeSection === "ai-provider" && (
								<AiProviderOverview onNavigate={setActiveSection} />
							)}
							{activeSection === "ai-provider-local" && (
								<AiProviderLocalSection />
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
									onVerify={handleVerify}
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
								<AiProviderCloudSection />
							)}
							{activeSection === "ai-instructions" && (
								<AiInstructionsOverview onNavigate={setActiveSection} />
							)}
							{activeSection === "ai-instructions-context" && (
								<PromptSection
									title="Practice Preferences"
									description="Freeform context included in every AI call — prosecution style, specialisations, formatting preferences, or anything else that applies across all matters."
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
									description="In-editor writing assistant. Helps draft and refine claim language, responses, and specifications directly in the document."
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
									description="Project-aware chat assistant. Has access to your sources and artifacts and can reason across the full matter."
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
									description="PDF metadata extraction. Runs automatically when a source is uploaded to pull key fields from office actions, prior art, and disclosures."
									defaultPrompt={DEFAULT_PROMPT_EXTRACTPAT}
									value={extractPatInstructions}
									savedValue={savedExtractPat}
									onChange={setExtractPatInstructions}
									onSave={saveExtractPat}
									showAlert
								/>
							)}
							{activeSection === "storage" && <StorageSection />}
							{activeSection === "billing" && <BillingSection />}
						</div>
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
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold flex items-center gap-1">
					<User className="w- h-5" /> You
				</h2>
				<p className="text-xs text-muted-foreground">
					Your profile and appearance settings.
				</p>
			</div>
			<Separator />
			<div className="flex flex-col gap-4">
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
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="role">Role / Job Title</Label>
					<Input
						id="role"
						value={role}
						onChange={(e) => onRoleChange(e.target.value)}
						placeholder="Patent Attorney, IP Paralegal…"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="jurisdiction">Jurisdiction / Region</Label>
					<Input
						id="jurisdiction"
						value={jurisdiction}
						onChange={(e) => onJurisdictionChange(e.target.value)}
						placeholder="USPTO, EPO, IPO…"
					/>
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
			<div className="flex justify-end">
				<SaveButton
					status={status}
					isDirty={isDirty}
					onClick={() => wrap(onSave)}
				/>
			</div>
		</div>
	)
}

// ─── AI Provider overview ─────────────────────────────────────────────────────

function AiProviderOverview({
	onNavigate,
}: {
	onNavigate: (section: Section) => void
}) {
	const options: {
		id: Section
		name: string
		description: string
		badge?: string
	}[] = [
			{
				id: "ai-provider-local",
				name: "Local",
				description:
					"Run models on your machine via Ollama. No API costs, fully private. Requires local setup.",
				badge: "Coming soon",
			},
			{
				id: "ai-provider-byok",
				name: "BYOK",
				description:
					"Bring your own Anthropic, OpenAI, or AI Gateway key. Pay providers directly — no markup.",
			},
			{
				id: "ai-provider-cloud",
				name: "Cloud",
				description:
					"Buy credits from PatrickOS. Simple billing, no provider accounts needed.",
				badge: "Coming soon",
			},
		]

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">AI Provider</h2>
				<p className="text-xs text-muted-foreground">
					Choose how PatrickOS accesses AI to power AskPat, AgentPat, and
					ExtractPat.
				</p>
			</div>
			<Separator />
			<div className="flex flex-col gap-3">
				{options.map((opt) => (
					<button
						key={opt.id}
						type="button"
						onClick={() => !opt.badge && onNavigate(opt.id)}
						className={cn(
							"rounded-lg border p-4 text-left transition-colors",
							opt.badge
								? "cursor-default opacity-60"
								: "hover:border-foreground/20 hover:bg-muted/50",
						)}
					>
						<div className="flex items-center gap-2">
							<p className="text-sm font-medium">{opt.name}</p>
							{opt.badge && (
								<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
									{opt.badge}
								</span>
							)}
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{opt.description}
						</p>
					</button>
				))}
			</div>
		</div>
	)
}

// ─── AI Provider — Local ──────────────────────────────────────────────────────

function AiProviderLocalSection() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">Local</h2>
				<p className="text-xs text-muted-foreground">
					Run models on your own machine via Ollama.
				</p>
			</div>
			<Separator />
			<p className="text-xs text-muted-foreground">
				Local model support via Ollama — coming soon. You will be able to run
				Llama, Mistral, and other open models with no API costs and full data
				privacy.
			</p>
		</div>
	)
}

// ─── AI Provider — BYOK ───────────────────────────────────────────────────────

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
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">BYOK</h2>
				<p className="text-xs text-muted-foreground">
					Your key is stored in the browser only — never sent to our servers.
				</p>
			</div>
			<Separator />

			{/* Provider cards */}
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

			{/* API key */}
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
						variant="outline"
						size="sm"
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
						<Button
							variant="ghost"
							size="sm"
							onClick={onClear}
							className="text-destructive hover:text-destructive"
						>
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

			{/* Models */}
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

			<div className="flex justify-end">
				<SaveButton
					status={status}
					isDirty={isDirty}
					onClick={() => wrap(onSave)}
				/>
			</div>
		</div>
	)
}

// ─── AI Provider — Cloud ──────────────────────────────────────────────────────

function AiProviderCloudSection() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">Cloud</h2>
				<p className="text-xs text-muted-foreground">
					Buy AI credits directly from PatrickOS.
				</p>
			</div>
			<Separator />
			<p className="text-xs text-muted-foreground">
				PatrickOS Cloud credits — coming soon. One simple balance, no provider
				accounts or API keys needed.
			</p>
		</div>
	)
}

// ─── Model select ─────────────────────────────────────────────────────────────

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

// ─── AI Instructions overview ─────────────────────────────────────────────────

function AiInstructionsOverview({
	onNavigate,
}: {
	onNavigate: (section: Section) => void
}) {
	const options: { id: Section; name: string; description: string }[] = [
		{
			id: "ai-instructions-context",
			name: "Practice Preferences",
			description:
				"Jurisdiction, firm specialisations, and preferred claim style. Injected into every AI call as shared context.",
		},
		{
			id: "ai-instructions-askpat",
			name: "AskPat",
			description:
				"In-editor writing assistant. Edit the full system prompt that controls how it drafts and refines document content.",
		},
		{
			id: "ai-instructions-agentpat",
			name: "AgentPat",
			description:
				"Project-aware chat assistant. Edit the full system prompt governing how it reasons across your matter.",
		},
		{
			id: "ai-instructions-extractpat",
			name: "ExtractPat",
			description:
				"PDF metadata extraction. Edit the full system prompt controlling what fields are pulled from uploaded sources.",
		},
	]

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">AI Instructions</h2>
				<p className="text-xs text-muted-foreground">
					Full system prompts for each AI persona. Because you supply the API
					key, you control exactly what these models are told.
				</p>
			</div>
			<Separator />
			<div className="flex flex-col gap-3">
				{options.map((opt) => (
					<button
						key={opt.id}
						type="button"
						onClick={() => onNavigate(opt.id)}
						className="rounded-lg border p-4 text-left transition-colors hover:border-foreground/20 hover:bg-muted/50"
					>
						<p className="text-sm font-medium">{opt.name}</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{opt.description}
						</p>
					</button>
				))}
			</div>
		</div>
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

	function handleSaveClick() {
		if (showAlert) {
			setAlertOpen(true)
		} else {
			wrap(onSave)
		}
	}

	return (
		<>
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="text-sm font-semibold">{title}</h2>
					<p className="text-xs text-muted-foreground">{description}</p>
					<Textarea
						value={displayValue}
						onChange={(e) => onChange(e.target.value)}
						placeholder="Enter custom instructions…"
						className="min-h-[220px] font-mono text-xs mt-6"
					/>
				</div>
				<div className="flex items-center justify-between">
					{defaultPrompt ? (
						<Button
							variant="ghost"
							size="sm"
							className="gap-1.5 text-muted-foreground"
							onClick={() => onChange(defaultPrompt)}
						>
							<RotateCcw size={12} />
							Reset to default
						</Button>
					) : (
						<span />
					)}
					<SaveButton
						status={status}
						isDirty={isDirty}
						onClick={handleSaveClick}
					/>
				</div>
			</div>

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

// ─── Storage section ──────────────────────────────────────────────────────────

function StorageSection() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">Storage</h2>
				<p className="text-xs text-muted-foreground">
					Where your projects, sources, and artifacts are stored.
				</p>
			</div>
			<Separator />
			<div className="rounded-md border bg-muted/40 p-4 text-sm">
				<p className="font-medium">Local storage</p>
				<p className="mt-1 text-xs text-muted-foreground">
					All data is stored locally in a SQLite database on this device.
					Nothing leaves your machine.
				</p>
			</div>
			<p className="text-xs text-muted-foreground">
				Cloud storage (Turso / self-hosted) — coming soon. Sync across devices
				and share with colleagues.
			</p>
		</div>
	)
}

// ─── Billing section ──────────────────────────────────────────────────────────

function BillingSection() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">Billing</h2>
				<p className="text-xs text-muted-foreground">
					Subscription and usage for PatrickOS Cloud.
				</p>
			</div>
			<Separator />
			<p className="text-xs text-muted-foreground">
				PatrickOS is currently free. Cloud credits and team billing — coming
				soon.
			</p>
		</div>
	)
}
