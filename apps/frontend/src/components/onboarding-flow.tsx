import {
	DEFAULT_PROMPT_AGENTPAT,
	DEFAULT_PROMPT_ASKPAT,
	DEFAULT_PROMPT_EXTRACTPAT,
	PROJECT_CONFIGS,
	type ProjectType,
} from "@patrickos/shared"
import { ChevronDown, Eye, EyeOff, FolderOpen, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { ScreenshotPlaceholder, SLIDES } from "@/components/tutorial-overlay"
import { Button } from "@/components/ui/button"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAI } from "@/lib/ai-context"
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

// Tauri v2 runtime detection
const isTauri =
	typeof window !== "undefined" &&
	// biome-ignore lint/suspicious/noExplicitAny: runtime detection
	!!(window as any).__TAURI_INTERNALS__

async function pickFolderNative(): Promise<string | null> {
	if (!isTauri) return null
	try {
		const { open } = await import("@tauri-apps/plugin-dialog")
		const result = await open({ directory: true, multiple: false })
		return typeof result === "string" ? result : null
	} catch {
		return null
	}
}

type StepId =
	| "you"
	| "ai"
	| "agentpat"
	| "askpat"
	| "extractpat"
	| "tutorial"
	| "project"
const STEPS: StepId[] = [
	"you",
	"ai",
	"agentpat",
	"askpat",
	"extractpat",
	"tutorial",
	"project",
]

const STEP_HEADINGS: Record<StepId, { title: string; description: string }> = {
	you: {
		title: "Tell us about yourself",
		description:
			"This personalizes every AI response to your practice. Your name and firm appear in document drafts. You can change these any time in Settings.",
	},
	ai: {
		title: "Connect your AI provider",
		description:
			"PatrickOS is BYOK — bring your own API key. It's stored in your profile folder as plain text, never sent anywhere except the provider you choose.",
	},
	agentpat: {
		title: "AgentPat system prompt",
		description:
			"AgentPat is your project-aware research assistant. This prompt shapes how it reasons across your matter — prosecution style, claim strategy, response tone. The built-in default works well; customize it to your practice.",
	},
	askpat: {
		title: "AskPat system prompt",
		description:
			"AskPat lives inside the document editor — it drafts, refines, and rewrites sections on demand. Leave blank to use the built-in default.",
	},
	extractpat: {
		title: "ExtractPat system prompt",
		description:
			"ExtractPat reads your PDFs and extracts structured metadata: office action dates, claim numbers, cited references. Leave blank to use the built-in default.",
	},
	tutorial: {
		title: "How it works",
		description: "A quick walkthrough of the main features. Skip any time.",
	},
	project: {
		title: "Load your first matter",
		description:
			"Point PatrickOS at an existing matter folder. Your files stay exactly where they are — PatrickOS only reads them and creates three small subfolders.",
	},
}

const PROVIDER_OPTIONS: { id: Provider; name: string; description: string }[] =
	[
		{
			id: "anthropic",
			name: "Anthropic",
			description: "Claude models. Direct API.",
		},
		{ id: "openai", name: "OpenAI", description: "GPT models. Direct API." },
		{ id: "google", name: "Google", description: "Gemini models. Direct API." },
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

// ─── More info collapsible ────────────────────────────────────────────────────

function MoreInfo({ items }: { items: string[] }) {
	const [open, setOpen] = useState(false)
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2">
				<ChevronDown
					size={12}
					className={cn(
						"transition-transform duration-200",
						open && "rotate-180",
					)}
				/>
				More info
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-3">
				<ul className="space-y-1.5 border-l-2 border-muted pl-4">
					{items.map((item) => (
						<li key={item} className="text-xs text-muted-foreground">
							{item}
						</li>
					))}
				</ul>
			</CollapsibleContent>
		</Collapsible>
	)
}

// ─── Per-step more-info content ───────────────────────────────────────────────

const STEP_MORE_INFO: Partial<Record<StepId, string[]>> = {
	you: [
		"Your name and firm appear in every AI-drafted document.",
		"This information is included in every AI request to help personalize responses.",
		"Stored in settings.yaml on your machine — never sent to PatrickOS.",
	],
	ai: [
		"You pay the provider directly — PatrickOS never touches your billing.",
		"Your API key is stored in settings.yaml in your profile folder, not on any server.",
		"Data retention and prompt training are controlled by you in the provider's dashboard — look for Zero Data Retention (ZDR) options.",
		"Get a key: Anthropic → console.anthropic.com · OpenAI → platform.openai.com · Google → aistudio.google.com",
	],
	agentpat: [
		"This is the system prompt prepended to every AgentPat conversation.",
		"The default prompt instructs AgentPat on patent prosecution conventions and response format.",
		"You can edit it here or reset to the default any time in Settings.",
	],
	askpat: [
		"This prompt is used by the in-editor AI assistant (AskPat).",
		"It shapes how AskPat drafts, strengthens, and reformats document sections.",
	],
	extractpat: [
		"ExtractPat reads PDFs and extracts structured metadata into analysis/ in your matter folder.",
		"The default prompt targets common patent prosecution fields — office action dates, claim numbers, cited references.",
	],
	project: [
		"PatrickOS never modifies your existing files — PDFs and Word docs are read-only sources.",
		"It creates three subfolders: chats/ (conversation history), artifacts/ (AI-drafted documents), analysis/ (extracted metadata).",
		"You can add more matters any time from the sidebar.",
	],
}

// ─────────────────────────────────────────────────────────────────────────────

export function OnboardingFlow({
	onComplete,
}: {
	/** Called when onboarding finishes. `projectPath` is set if the user created a project. */
	onComplete: (projectPath?: string) => void
}) {
	const ai = useAI()
	const [stepIndex, setStepIndex] = useState(0)
	const [saving, setSaving] = useState(false)

	// YOU
	const [name, setName] = useState("")
	const [firm, setFirm] = useState("")
	const [role, setRole] = useState("")
	const [jurisdiction, setJurisdiction] = useState("")

	// AI
	const [provider, setProvider] = useState<Provider>("anthropic")
	const [keys, setKeys] = useState<Record<Provider, string>>({
		anthropic: "",
		openai: "",
		google: "",
		gateway: "",
	})
	const [showKey, setShowKey] = useState(false)
	const [quickModel, setQuickModel] = useState(DEFAULT_QUICK_MODEL.anthropic)
	const [detailedModel, setDetailedModel] = useState(
		DEFAULT_DETAILED_MODEL.anthropic,
	)
	const [verifyStatus, setVerifyStatus] = useState<
		"idle" | "verifying" | "valid" | "invalid"
	>("idle")

	// Tutorial (sub-slides within the tutorial step)
	const [tutorialSlideIndex, setTutorialSlideIndex] = useState(0)

	// Project
	const [projectPath, setProjectPath] = useState("")
	const [projectType, setProjectType] = useState<ProjectType | "">("")
	const [projectPicking, setProjectPicking] = useState(false)

	// Prompts
	const [agentPatPrompt, setAgentPatPrompt] = useState("")
	const [askPatPrompt, setAskPatPrompt] = useState("")
	const [extractPatPrompt, setExtractPatPrompt] = useState("")

	// Load existing settings once on mount
	useEffect(() => {
		api.settings.get().then((s) => {
			setName(s.profile.name || "")
			setFirm(s.profile.firm || "")
			setRole(s.profile.role || "")
			setJurisdiction(s.profile.jurisdiction || "")
			const p = (s.ai.provider as Provider) || "anthropic"
			setProvider(p)
			setKeys({
				anthropic: s.ai.anthropicKey || "",
				openai: s.ai.openaiKey || "",
				google: s.ai.googleKey || "",
				gateway: s.ai.gatewayKey || "",
			})
			setQuickModel(s.ai.quickModel || DEFAULT_QUICK_MODEL[p])
			setDetailedModel(s.ai.model || DEFAULT_DETAILED_MODEL[p])
			setAgentPatPrompt(s.prompts.agentpat || DEFAULT_PROMPT_AGENTPAT)
			setAskPatPrompt(s.prompts.askpat || DEFAULT_PROMPT_ASKPAT)
			setExtractPatPrompt(s.prompts.extractpat || DEFAULT_PROMPT_EXTRACTPAT)
		})
	}, [])

	const currentKey = keys[provider]

	function handleProviderChange(p: Provider) {
		setProvider(p)
		setVerifyStatus("idle")
		const quickModels =
			p === "gateway"
				? GATEWAY_QUICK_MODELS
				: (CURATED_MODELS[p as "anthropic" | "openai" | "google"] ?? [])
		const detModels =
			p === "gateway"
				? GATEWAY_DETAILED_MODELS
				: (CURATED_MODELS[p as "anthropic" | "openai" | "google"] ?? [])
		if (!quickModels.some((m) => m.id === quickModel))
			setQuickModel(DEFAULT_QUICK_MODEL[p])
		if (!detModels.some((m) => m.id === detailedModel))
			setDetailedModel(DEFAULT_DETAILED_MODEL[p])
	}

	async function verifyKey() {
		if (!currentKey) return
		setVerifyStatus("verifying")
		try {
			const r = await api.ai.verifyKey(provider, currentKey)
			setVerifyStatus(r.valid ? "valid" : "invalid")
		} catch {
			setVerifyStatus("invalid")
		}
	}

	async function saveCurrentStep() {
		const step = STEPS[stepIndex]
		if (step === "you") {
			await api.settings.update({ profile: { name, firm, role, jurisdiction } })
		} else if (step === "ai") {
			const keyField = `${provider}Key` as
				| "anthropicKey"
				| "openaiKey"
				| "googleKey"
				| "gatewayKey"
			await api.settings.update({
				ai: {
					provider,
					model: detailedModel,
					quickModel,
					[keyField]: currentKey,
				},
			})
			// Sync AI context state + localStorage caches
			ai.saveAiSettings(provider, currentKey, quickModel, detailedModel)
		} else if (step === "agentpat") {
			await api.settings.update({ prompts: { agentpat: agentPatPrompt } })
		} else if (step === "askpat") {
			await api.settings.update({ prompts: { askpat: askPatPrompt } })
		} else if (step === "extractpat") {
			await api.settings.update({ prompts: { extractpat: extractPatPrompt } })
		}
		// "project" is handled separately in handleNext — returns the path
	}

	async function handleNext() {
		const step = STEPS[stepIndex]
		const isLast = stepIndex === STEPS.length - 1

		// Tutorial step: advance through sub-slides before moving on
		if (step === "tutorial") {
			if (tutorialSlideIndex < SLIDES.length - 1) {
				setTutorialSlideIndex((t) => t + 1)
				return
			}
			// Last tutorial slide — advance to project step
			setTutorialSlideIndex(0)
			setStepIndex((s) => s + 1)
			return
		}

		setSaving(true)
		try {
			if (step === "project") {
				const trimmed = projectPath.trim()
				if (trimmed)
					await api.projects.create(
						trimmed,
						undefined,
						projectType || undefined,
					)
				await ai.reloadSettings()
				onComplete(trimmed || undefined)
				return
			}

			await saveCurrentStep()
			if (isLast) {
				await ai.reloadSettings()
				onComplete()
			} else {
				setStepIndex((s) => s + 1)
			}
		} finally {
			setSaving(false)
		}
	}

	function handleBack() {
		const step = STEPS[stepIndex]
		if (step === "tutorial" && tutorialSlideIndex > 0) {
			setTutorialSlideIndex((t) => t - 1)
			return
		}
		setStepIndex((s) => Math.max(0, s - 1))
		if (step === "project") setTutorialSlideIndex(SLIDES.length - 1)
	}

	async function handleSkip() {
		const step = STEPS[stepIndex]
		const isLast = stepIndex === STEPS.length - 1
		// Skip tutorial entirely
		if (step === "tutorial") {
			setTutorialSlideIndex(0)
			setStepIndex((s) => s + 1)
			return
		}
		if (isLast || step === "project") {
			await ai.reloadSettings()
			onComplete()
		} else {
			setStepIndex((s) => s + 1)
		}
	}

	async function handleBrowseProject() {
		setProjectPicking(true)
		try {
			const picked = await pickFolderNative()
			if (picked) setProjectPath(picked)
		} finally {
			setProjectPicking(false)
		}
	}

	const quickModelOptions = (
		provider === "gateway"
			? GATEWAY_QUICK_MODELS
			: (CURATED_MODELS[provider as "anthropic" | "openai" | "google"] ?? [])
	).map((m) => ({ value: m.id, label: m.name, pricingPerM: m.pricingPerM }))

	const detailedModelOptions = (
		provider === "gateway"
			? GATEWAY_DETAILED_MODELS
			: (CURATED_MODELS[provider as "anthropic" | "openai" | "google"] ?? [])
	).map((m) => ({ value: m.id, label: m.name, pricingPerM: m.pricingPerM }))

	const isLast = stepIndex === STEPS.length - 1

	return (
		<div className="fixed inset-0 z-50 bg-background flex flex-col">
			{/* Progress bar */}
			<div className="flex gap-1.5 px-8 pt-8 shrink-0">
				{STEPS.map((_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static steps
						key={i}
						className={cn(
							"h-1 flex-1 rounded-full transition-colors duration-300",
							i <= stepIndex ? "bg-primary" : "bg-muted",
						)}
					/>
				))}
			</div>

			{/* Step content — only current step rendered */}
			<div className="flex-1 overflow-y-auto">
				{(() => {
					const stepId = STEPS[stepIndex]
					const i = stepIndex
					const heading = STEP_HEADINGS[stepId]

					// Tutorial step — full-width slide layout
					if (stepId === "tutorial") {
						const slide = SLIDES[tutorialSlideIndex]
						return (
							<div
								key={`tutorial-${tutorialSlideIndex}`}
								className="mx-auto w-full max-w-2xl px-8 py-8 space-y-5"
							>
								<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
									Step {i + 1} of {STEPS.length} — {tutorialSlideIndex + 1} /{" "}
									{SLIDES.length}
								</p>
								<ScreenshotPlaceholder
									hint={slide.screenshotHint}
									src={slide.screenshotSrc}
									alt={slide.title}
								/>
								<div>
									<h2 className="text-xl font-bold font-heading tracking-tight mb-1">
										{slide.title}
									</h2>
									<p className="text-sm text-muted-foreground">
										{slide.description}
									</p>
								</div>
								<ul className="space-y-1.5">
									{slide.bullets.map((b) => (
										<li key={b} className="flex items-start gap-2 text-sm">
											<span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
											{b}
										</li>
									))}
								</ul>
								{/* Sub-slide dots */}
								<div className="flex gap-1.5 pt-1">
									{SLIDES.map((_, si) => (
										<div
											// biome-ignore lint/suspicious/noArrayIndexKey: static slides
											key={si}
											className={cn(
												"h-1 w-6 rounded-full transition-colors",
												si === tutorialSlideIndex ? "bg-primary" : "bg-muted",
											)}
										/>
									))}
								</div>
							</div>
						)
					}

					return (
						<div key={stepId} className="mx-auto w-full max-w-lg px-8 py-10">
							<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
								Step {i + 1} of {STEPS.length}
							</p>
							<h2 className="text-2xl font-bold font-heading tracking-tight mb-2">
								{heading.title}
							</h2>
							<p className="text-sm text-muted-foreground mb-2">
								{heading.description}
							</p>
							{STEP_MORE_INFO[stepId] && (
								<div className="mb-6">
									<MoreInfo items={STEP_MORE_INFO[stepId] as string[]} />
								</div>
							)}

							{stepId === "you" && (
								<div className="flex flex-col gap-4">
									<div className="grid grid-cols-2 gap-3">
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="ob-name">Name</Label>
											<Input
												id="ob-name"
												value={name}
												onChange={(e) => setName(e.target.value)}
												placeholder="Jane Smith"
											/>
										</div>
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="ob-firm">Firm</Label>
											<Input
												id="ob-firm"
												value={firm}
												onChange={(e) => setFirm(e.target.value)}
												placeholder="Smith & Associates IP"
											/>
										</div>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="ob-role">Role</Label>
											<Input
												id="ob-role"
												value={role}
												onChange={(e) => setRole(e.target.value)}
												placeholder="Patent Attorney"
											/>
										</div>
										<div className="flex flex-col gap-1.5">
											<Label htmlFor="ob-jur">Jurisdiction</Label>
											<Input
												id="ob-jur"
												value={jurisdiction}
												onChange={(e) => setJurisdiction(e.target.value)}
												placeholder="USPTO, EPO…"
											/>
										</div>
									</div>
								</div>
							)}

							{stepId === "ai" && (
								<div className="flex flex-col gap-5">
									<div className="grid grid-cols-2 gap-3">
										{PROVIDER_OPTIONS.map((p) => (
											<button
												key={p.id}
												type="button"
												onClick={() => handleProviderChange(p.id)}
												className={cn(
													"rounded-lg border p-3 text-left transition-colors",
													provider === p.id
														? "border-primary bg-primary/5 ring-1 ring-primary"
														: "hover:border-foreground/20 hover:bg-muted/50",
												)}
											>
												<p className="text-sm font-medium">{p.name}</p>
												<p className="text-xs text-muted-foreground">
													{p.description}
												</p>
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
													onChange={(e) =>
														setKeys((prev) => ({
															...prev,
															[provider]: e.target.value,
														}))
													}
													placeholder={PROVIDER_PLACEHOLDER[provider]}
													className="pr-8"
												/>
												<Button
													variant="ghost"
													size="icon-xs"
													type="button"
													className="absolute right-1 top-1/2 -translate-y-1/2"
													onClick={() => setShowKey((v) => !v)}
												>
													{showKey ? <EyeOff size={12} /> : <Eye size={12} />}
												</Button>
											</div>
											<Button
												variant="secondary"
												onClick={verifyKey}
												disabled={!currentKey || verifyStatus === "verifying"}
											>
												{verifyStatus === "verifying" ? (
													<Loader2 size={12} className="animate-spin" />
												) : (
													"Verify"
												)}
											</Button>
										</div>
										{verifyStatus !== "idle" && (
											<p
												className={cn(
													"text-xs",
													verifyStatus === "valid" && "text-green-600",
													verifyStatus === "invalid" && "text-destructive",
													verifyStatus === "verifying" &&
														"text-muted-foreground",
												)}
											>
												{verifyStatus === "valid" && "✓ Connected"}
												{verifyStatus === "invalid" &&
													"Invalid key — check and try again"}
												{verifyStatus === "verifying" && "Verifying…"}
											</p>
										)}
									</div>

									<div className="grid grid-cols-2 gap-4">
										<div className="flex flex-col gap-1.5">
											<Label>Quick model</Label>
											<p className="text-xs text-muted-foreground">
												AskPat, ExtractPat — fast
											</p>
											<Select value={quickModel} onValueChange={setQuickModel}>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{quickModelOptions.map((o) => (
														<SelectItem key={o.value} value={o.value}>
															{o.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{(() => {
												const sel = quickModelOptions.find(
													(o) => o.value === quickModel,
												)
												return sel?.pricingPerM ? (
													<p className="text-xs tabular-nums text-muted-foreground">
														${sel.pricingPerM.input.toFixed(2)} in · $
														{sel.pricingPerM.output.toFixed(2)} out / M tokens
													</p>
												) : null
											})()}
										</div>
										<div className="flex flex-col gap-1.5">
											<Label>Detailed model</Label>
											<p className="text-xs text-muted-foreground">
												AgentPat — best reasoning
											</p>
											<Select
												value={detailedModel}
												onValueChange={setDetailedModel}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{detailedModelOptions.map((o) => (
														<SelectItem key={o.value} value={o.value}>
															{o.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{(() => {
												const sel = detailedModelOptions.find(
													(o) => o.value === detailedModel,
												)
												return sel?.pricingPerM ? (
													<p className="text-xs tabular-nums text-muted-foreground">
														${sel.pricingPerM.input.toFixed(2)} in · $
														{sel.pricingPerM.output.toFixed(2)} out / M tokens
													</p>
												) : null
											})()}
										</div>
									</div>
								</div>
							)}

							{stepId === "agentpat" && (
								<Textarea
									value={agentPatPrompt}
									onChange={(e) => setAgentPatPrompt(e.target.value)}
									className="min-h-[280px] font-mono text-xs"
								/>
							)}

							{stepId === "askpat" && (
								<Textarea
									value={askPatPrompt}
									onChange={(e) => setAskPatPrompt(e.target.value)}
									className="min-h-[280px] font-mono text-xs"
								/>
							)}

							{stepId === "extractpat" && (
								<Textarea
									value={extractPatPrompt}
									onChange={(e) => setExtractPatPrompt(e.target.value)}
									className="min-h-[280px] font-mono text-xs"
								/>
							)}

							{stepId === "project" && (
								<div className="flex flex-col gap-4">
									<div className="flex flex-col gap-1.5">
										<Label>Matter folder path</Label>
										<div className="flex gap-2">
											<Input
												value={projectPath}
												onChange={(e) => setProjectPath(e.target.value)}
												placeholder="/Users/jane/matters/client-acme-123"
												className="font-mono text-xs"
												autoFocus
											/>
											{isTauri && (
												<Button
													type="button"
													variant="secondary"
													onClick={handleBrowseProject}
													disabled={projectPicking}
												>
													{projectPicking ? (
														<Loader2 size={12} className="animate-spin" />
													) : (
														<>
															<FolderOpen size={12} />
															Browse
														</>
													)}
												</Button>
											)}
										</div>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label>Matter type</Label>
										<Select
											value={projectType}
											onValueChange={(v) => setProjectType(v as ProjectType)}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a matter type…" />
											</SelectTrigger>
											<SelectContent>
												{PROJECT_CONFIGS.map((p) => (
													<SelectItem key={p.id} value={p.id}>
														{p.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<p className="text-xs text-muted-foreground">
											Tells AgentPat what kind of response this matter is, so it
											can tailor its help. Optional — you can set it later.
										</p>
									</div>
									<div className="rounded-md border bg-muted/40 px-4 py-3 text-xs text-muted-foreground space-y-1">
										<p className="font-medium text-foreground">
											What PatrickOS will create inside:
										</p>
										<p>
											<code className="font-mono">chats/</code> — conversation
											history (JSON, readable)
										</p>
										<p>
											<code className="font-mono">artifacts/</code> — AI-drafted
											documents (Plate JSON + .docx)
										</p>
										<p>
											<code className="font-mono">analysis/</code> — extracted
											metadata per source file
										</p>
									</div>
								</div>
							)}
						</div>
					)
				})()}
			</div>

			{/* Navigation */}
			<div className="shrink-0 border-t bg-background px-8 py-4 flex items-center justify-between">
				<Button
					type="button"
					variant="outline"
					onClick={handleBack}
					disabled={(stepIndex === 0 && tutorialSlideIndex === 0) || saving}
				>
					← Back
				</Button>
				<div className="flex items-center gap-3">
					{STEPS[stepIndex] !== "you" && (
						<Button
							type="button"
							variant="ghost"
							onClick={handleSkip}
							disabled={saving}
							className="text-muted-foreground"
						>
							{STEPS[stepIndex] === "tutorial"
								? "Skip tutorial"
								: isLast
									? "Skip — I'll add a project later"
									: "Skip for now"}
						</Button>
					)}
					<Button type="button" onClick={handleNext} disabled={saving}>
						{saving ? (
							<Loader2 size={12} className="animate-spin" />
						) : isLast && projectPath.trim() ? (
							"Load project →"
						) : isLast ? (
							"Finish"
						) : STEPS[stepIndex] === "tutorial" ? (
							tutorialSlideIndex < SLIDES.length - 1 ? (
								"Next →"
							) : (
								"Done →"
							)
						) : (
							"Next →"
						)}
					</Button>
				</div>
			</div>
		</div>
	)
}
