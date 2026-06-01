import { Loader2 } from "lucide-react"
import { useState } from "react"
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
import {
	DEFAULT_DETAILED_MODEL,
	DEFAULT_QUICK_MODEL,
	type Provider,
} from "@/lib/ai-models"
import { api } from "@/lib/api"

const PROVIDERS: { id: Provider; label: string; placeholder: string }[] = [
	{ id: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
	{ id: "openai", label: "OpenAI", placeholder: "sk-..." },
	{ id: "google", label: "Google", placeholder: "AIza..." },
	{ id: "gateway", label: "AI Gateway", placeholder: "aig_..." },
]

export function SetupDialog({
	open,
	onDone,
}: {
	open: boolean
	onDone: () => void
}) {
	const [step, setStep] = useState<1 | 2>(1)

	// Step 1 — profile
	const [name, setName] = useState("")
	const [firm, setFirm] = useState("")
	const [role, setRole] = useState("")
	const [jurisdiction, setJurisdiction] = useState("")

	// Step 2 — AI
	const [provider, setProvider] = useState<Provider>("anthropic")
	const [apiKey, setApiKey] = useState("")

	const [saving, setSaving] = useState(false)

	function defaultModels(p: Provider) {
		return {
			model: DEFAULT_DETAILED_MODEL[p],
			quickModel: DEFAULT_QUICK_MODEL[p],
		}
	}

	async function saveProfile() {
		await api.settings.update({ profile: { name, firm, role, jurisdiction } })
	}

	async function saveAi() {
		const keyField = `${provider}Key` as
			| "anthropicKey"
			| "openaiKey"
			| "googleKey"
			| "gatewayKey"
		await api.settings.update({
			ai: {
				provider,
				...defaultModels(provider),
				[keyField]: apiKey,
			},
		})
	}

	async function handleNext() {
		setSaving(true)
		try {
			await saveProfile()
			setStep(2)
		} finally {
			setSaving(false)
		}
	}

	async function handleFinish() {
		setSaving(true)
		try {
			if (apiKey) await saveAi()
			onDone()
		} finally {
			setSaving(false)
		}
	}

	const placeholder =
		PROVIDERS.find((p) => p.id === provider)?.placeholder ?? ""

	return (
		<Dialog open={open} onOpenChange={() => {}}>
			<DialogContent
				className="sm:max-w-md"
				// Prevent closing by clicking outside during setup
				onInteractOutside={(e) => e.preventDefault()}
				onEscapeKeyDown={(e) => e.preventDefault()}
			>
				<DialogTitle>
					{step === 1 ? "Welcome to PatrickOS" : "Connect AI"}
				</DialogTitle>
				<DialogDescription>
					{step === 1
						? "A couple of details so the AI knows who it's helping."
						: "Add an API key to start chatting. You can change this any time in Settings."}
				</DialogDescription>

				{step === 1 ? (
					<div className="flex flex-col gap-3 py-2">
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="setup-name">Name</Label>
								<Input
									id="setup-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Jane Smith"
									autoFocus
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="setup-firm">Firm</Label>
								<Input
									id="setup-firm"
									value={firm}
									onChange={(e) => setFirm(e.target.value)}
									placeholder="Smith & Associates IP"
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="setup-role">Role</Label>
								<Input
									id="setup-role"
									value={role}
									onChange={(e) => setRole(e.target.value)}
									placeholder="Patent Attorney"
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="setup-jurisdiction">Jurisdiction</Label>
								<Input
									id="setup-jurisdiction"
									value={jurisdiction}
									onChange={(e) => setJurisdiction(e.target.value)}
									placeholder="USPTO, EPO…"
								/>
							</div>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-3 py-2">
						<div className="flex flex-col gap-1.5">
							<Label>Provider</Label>
							<Select
								value={provider}
								onValueChange={(v) => {
									setProvider(v as Provider)
									setApiKey("")
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PROVIDERS.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="setup-key">API Key</Label>
							<Input
								id="setup-key"
								type="password"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								placeholder={placeholder}
								autoFocus
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							Stored locally in settings.yaml — never sent anywhere except the
							provider you choose.
						</p>
					</div>
				)}

				<div className="flex items-center justify-between pt-1">
					<Button
						type="button"
						variant="ghost"
						onClick={onDone}
						className="text-muted-foreground"
					>
						{step === 1 ? "Skip setup" : "Skip for now"}
					</Button>

					<div className="flex items-center gap-2">
						{step === 2 && (
							<Button
								type="button"
								variant="outline"
								onClick={() => setStep(1)}
								disabled={saving}
							>
								Back
							</Button>
						)}
						<Button
							type="button"
							onClick={step === 1 ? handleNext : handleFinish}
							disabled={saving || (step === 1 && !name.trim())}
						>
							{saving ? (
								<Loader2 size={12} className="animate-spin" />
							) : step === 1 ? (
								"Next"
							) : (
								"Finish"
							)}
						</Button>
					</div>
				</div>

				<p className="text-center text-xs text-muted-foreground">
					Step {step} of 2
				</p>
			</DialogContent>
		</Dialog>
	)
}
