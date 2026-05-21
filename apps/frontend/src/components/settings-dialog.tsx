import {
	CreditCard,
	Database,
	Eye,
	EyeOff,
	Loader2,
	MessageSquare,
	Sparkles,
	User,
} from "lucide-react"
import * as React from "react"
import { useTheme } from "@/components/theme-provider"
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
	type GatewayModel,
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

// ─── Nav ──────────────────────────────────────────────────────────────────────

type NavItem = {
	id: Section
	label: string
	icon: React.ElementType
	children?: { id: Section; label: string }[]
}

const NAV: NavItem[] = [
	{ id: "account", label: "Account", icon: User },
	{
		id: "ai-provider",
		label: "AI Provider",
		icon: Sparkles,
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
			{ id: "ai-instructions-context", label: "Practice Context" },
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
			current: "Practice Context",
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
	const [activeSection, setActiveSection] = React.useState<Section>("account")

	// ── Account state ──────────────────────────────────────────────────────────
	const [name, setName] = React.useState(
		() => localStorage.getItem("account-name") ?? "",
	)
	const [firm, setFirm] = React.useState(
		() => localStorage.getItem("account-firm") ?? "",
	)

	// ── AI Provider state ──────────────────────────────────────────────────────
	const [tempProvider, setTempProvider] =
		React.useState<Provider>(savedProvider)
	const [tempKeys, setTempKeys] = React.useState<Record<Provider, string>>({
		gateway: "",
		anthropic: "",
		openai: "",
	})
	const [tempQuickModel, setTempQuickModel] = React.useState(savedQuickModel)
	const [tempDetailedModel, setTempDetailedModel] =
		React.useState(savedDetailedModel)
	const [showKey, setShowKey] = React.useState(false)
	const [gatewayModels, setGatewayModels] = React.useState<GatewayModel[]>([])
	const [modelsLoading, setModelsLoading] = React.useState(false)

	// ── AI Instructions state ──────────────────────────────────────────────────
	const [practiceContext, setPracticeContext] = React.useState("")
	const [askPatInstructions, setAskPatInstructions] = React.useState("")
	const [agentPatInstructions, setAgentPatInstructions] = React.useState("")
	const [extractPatInstructions, setExtractPatInstructions] = React.useState("")

	// ── Sync on open ──────────────────────────────────────────────────────────
	React.useEffect(() => {
		if (!open) return
		setTempProvider(savedProvider)
		setTempKeys({
			gateway: localStorage.getItem("ai-gateway-key") ?? "",
			anthropic: localStorage.getItem("ai-anthropic-key") ?? "",
			openai: localStorage.getItem("ai-openai-key") ?? "",
		})
		setTempQuickModel(savedQuickModel)
		setTempDetailedModel(savedDetailedModel)
		setName(localStorage.getItem("account-name") ?? "")
		setFirm(localStorage.getItem("account-firm") ?? "")
		setPracticeContext(localStorage.getItem("instructions-context") ?? "")
		setAskPatInstructions(localStorage.getItem("instructions-askpat") ?? "")
		setAgentPatInstructions(localStorage.getItem("instructions-agentpat") ?? "")
		setExtractPatInstructions(
			localStorage.getItem("instructions-extractpat") ?? "",
		)
	}, [open, savedProvider, savedQuickModel, savedDetailedModel])

	// ── AI Provider handlers ───────────────────────────────────────────────────

	function handleProviderChange(p: Provider) {
		setTempProvider(p)
		if (p !== "gateway") {
			const models = CURATED_MODELS[p]
			if (!models.some((m) => m.id === tempQuickModel))
				setTempQuickModel(DEFAULT_QUICK_MODEL[p])
			if (!models.some((m) => m.id === tempDetailedModel))
				setTempDetailedModel(DEFAULT_DETAILED_MODEL[p])
		}
	}

	async function handleVerify() {
		const key = tempKeys[tempProvider]
		await onVerify(tempProvider, key)
		if (tempProvider === "gateway" && key) await loadGatewayModels(key)
	}

	async function loadGatewayModels(key: string) {
		if (!key) return
		setModelsLoading(true)
		try {
			const result = await api.ai.getModels(key)
			setGatewayModels(result.models)
		} catch {
			// silently fail
		} finally {
			setModelsLoading(false)
		}
	}

	const currentKey = tempKeys[tempProvider]

	const modelOptions =
		tempProvider === "gateway"
			? gatewayModels.map((m) => ({
					value: m.id,
					label: m.name,
					pricingPerM: m.pricing
						? {
								input: parseFloat(m.pricing.input) * 1_000_000,
								output: parseFloat(m.pricing.output) * 1_000_000,
							}
						: undefined,
				}))
			: CURATED_MODELS[tempProvider].map((m) => ({
					value: m.id,
					label: m.name,
					pricingPerM: m.pricingPerM,
				}))

	// ── Save handlers ─────────────────────────────────────────────────────────

	function saveAccount() {
		localStorage.setItem("account-name", name)
		localStorage.setItem("account-firm", firm)
	}

	function saveProvider() {
		onSave(tempProvider, currentKey, tempQuickModel, tempDetailedModel)
	}

	function saveInstructions() {
		localStorage.setItem("instructions-context", practiceContext)
		localStorage.setItem("instructions-askpat", askPatInstructions)
		localStorage.setItem("instructions-agentpat", agentPatInstructions)
		localStorage.setItem("instructions-extractpat", extractPatInstructions)
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
					style={{ "--sidebar-width": "13rem" } as React.CSSProperties}
				>
					<Sidebar collapsible="none" className="hidden md:flex">
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
									theme={theme}
									onNameChange={setName}
									onFirmChange={setFirm}
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
									modelOptions={modelOptions}
									modelsLoading={modelsLoading}
									onProviderChange={handleProviderChange}
									onKeyChange={(v) =>
										setTempKeys((prev) => ({ ...prev, [tempProvider]: v }))
									}
									onShowKeyToggle={() => setShowKey((v) => !v)}
									onVerify={handleVerify}
									onClear={() => {
										setTempKeys((prev) => ({ ...prev, [tempProvider]: "" }))
										setGatewayModels([])
										onClear()
									}}
									onRefreshModels={() => loadGatewayModels(currentKey)}
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
									title="Practice Context"
									description="Jurisdiction, firm specialisations, and preferred claim style. Included in every AI call."
									value={practiceContext}
									onChange={setPracticeContext}
									onSave={saveInstructions}
								/>
							)}
							{activeSection === "ai-instructions-askpat" && (
								<PromptSection
									title="AskPat"
									description="In-editor writing assistant. Helps draft and refine claim language, responses, and specifications directly in the document."
									storageKey="prompt-askpat"
									value={askPatInstructions}
									onChange={setAskPatInstructions}
									onSave={saveInstructions}
								/>
							)}
							{activeSection === "ai-instructions-agentpat" && (
								<PromptSection
									title="AgentPat"
									description="Project-aware chat assistant. Has access to your sources and artifacts and can reason across the full matter."
									storageKey="prompt-agentpat"
									value={agentPatInstructions}
									onChange={setAgentPatInstructions}
									onSave={saveInstructions}
								/>
							)}
							{activeSection === "ai-instructions-extractpat" && (
								<PromptSection
									title="ExtractPat"
									description="PDF metadata extraction. Runs automatically when a source is uploaded to pull key fields from office actions, prior art, and disclosures."
									storageKey="prompt-extractpat"
									value={extractPatInstructions}
									onChange={setExtractPatInstructions}
									onSave={saveInstructions}
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
	theme,
	onNameChange,
	onFirmChange,
	onThemeChange,
	onSave,
}: {
	name: string
	firm: string
	theme: string
	onNameChange: (v: string) => void
	onFirmChange: (v: string) => void
	onThemeChange: (v: "light" | "dark" | "system") => void
	onSave: () => void
}) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">Account</h2>
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
				<Button size="sm" onClick={onSave}>
					Save
				</Button>
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
	modelOptions,
	modelsLoading,
	onProviderChange,
	onKeyChange,
	onShowKeyToggle,
	onVerify,
	onClear,
	onRefreshModels,
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
	modelOptions: {
		value: string
		label: string
		pricingPerM?: { input: number; output: number }
	}[]
	modelsLoading: boolean
	onProviderChange: (p: Provider) => void
	onKeyChange: (v: string) => void
	onShowKeyToggle: () => void
	onVerify: () => void
	onClear: () => void
	onRefreshModels: () => void
	onQuickModelChange: (v: string) => void
	onDetailedModelChange: (v: string) => void
	onSave: () => void
}) {
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
				<div className="flex items-center justify-between">
					<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
						Models
					</p>
					{tempProvider === "gateway" && (
						<Button
							variant="ghost"
							size="xs"
							onClick={onRefreshModels}
							disabled={!currentKey || modelsLoading}
						>
							{modelsLoading ? (
								<Loader2 size={11} className="animate-spin" />
							) : (
								"Refresh"
							)}
						</Button>
					)}
				</div>

				{tempProvider === "gateway" &&
					modelOptions.length === 0 &&
					!modelsLoading && (
						<p className="text-xs text-muted-foreground">
							Verify your key to load available models.
						</p>
					)}

				{(tempProvider !== "gateway" || modelOptions.length > 0) && (
					<div className="grid grid-cols-2 gap-4">
						<ModelSelect
							label="Quick Model"
							description="AskPat and ExtractPat — fast and cheap."
							value={tempQuickModel}
							options={modelOptions}
							onChange={onQuickModelChange}
						/>
						<ModelSelect
							label="Detailed Model"
							description="AgentPat — thorough, best reasoning."
							value={tempDetailedModel}
							options={modelOptions}
							onChange={onDetailedModelChange}
						/>
					</div>
				)}
			</div>

			<div className="flex justify-end">
				<Button size="sm" onClick={onSave}>
					Save
				</Button>
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
			name: "Practice Context",
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
	value,
	onChange,
	onSave,
}: {
	title: string
	description: string
	value: string
	onChange: (v: string) => void
	onSave: () => void
}) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold">{title}</h2>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<Separator />
			<div className="flex flex-col gap-1.5">
				<Label>System prompt</Label>
				<Textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="Enter custom instructions…"
					className="min-h-[220px] font-mono text-xs"
				/>
			</div>
			<div className="flex justify-end">
				<Button size="sm" onClick={onSave}>
					Save
				</Button>
			</div>
		</div>
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
