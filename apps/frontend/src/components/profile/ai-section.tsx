import {
	type AiEffort,
	type AiSettings,
	modelsForProvider,
	type Provider,
	recommendedModelFor,
} from "@patrick/shared";
import { ArrowUpRight, Eye, EyeOff, X } from "lucide-react";
import { useState } from "react";
import { KeyStatusDot } from "@/components/key-status-dot";
import { ModelPicker } from "@/components/model-picker";
import { OptionCard } from "@/components/option-card";
import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
	type KeyStatus,
	keyStatusOf,
	useKeyVerification,
} from "@/hooks/use-key-verification";

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
	];

const PROVIDER_PLACEHOLDER: Record<Provider, string> = {
	anthropic: "sk-ant-…",
	openai: "sk-…",
	google: "AIza…",
	gateway: "aig_…",
};

// Where to create a key for each provider (used by the contextual "Get a key" link).
const PROVIDER_KEY_URL: Record<Provider, string> = {
	anthropic: "https://console.anthropic.com/settings/keys",
	openai: "https://platform.openai.com/api-keys",
	google: "https://aistudio.google.com/app/apikey",
	gateway: "https://vercel.com/dashboard/ai-gateway",
};

const EFFORTS: { id: AiEffort; label: string }[] = [
	{ id: "low", label: "Low — fastest" },
	{ id: "medium", label: "Medium — balanced" },
	{ id: "high", label: "High — thorough" },
];

const STATUS_TEXT: Record<KeyStatus, { text: string; cls: string }> = {
	idle: { text: "Enter your key to connect", cls: "text-muted-foreground" },
	verifying: { text: "Checking your key…", cls: "text-muted-foreground" },
	valid: { text: "Connected", cls: "text-emerald-600 dark:text-emerald-400" },
	invalid: {
		text: "Invalid key — check and try again",
		cls: "text-destructive",
	},
};

export function AiSection({
	value,
	onChange,
}: {
	value: AiSettings;
	onChange: (value: AiSettings) => void;
}) {
	const set = (patch: Partial<AiSettings>) => onChange({ ...value, ...patch });
	const [showKey, setShowKey] = useState(false);
	const providerName =
		PROVIDER_OPTIONS.find((p) => p.id === value.provider)?.name ?? "provider";

	// Auto-verify shortly after the key stops changing — no manual Verify step.
	// Cached by [provider, key]; a new key value re-verifies.
	const debouncedKey = useDebouncedValue(value.apiKey, 500);
	const verification = useKeyVerification(value.provider, debouncedKey, {
		enabled: !!debouncedKey,
	});
	// While still typing (live key ahead of the debounced one) show "checking"
	// rather than a stale result.
	const pending = !!value.apiKey && value.apiKey !== debouncedKey;
	const status: KeyStatus = pending ? "verifying" : keyStatusOf(verification);

	function changeProvider(provider: Provider) {
		// Keep the chosen model if the new provider offers it, else its default.
		const keep = modelsForProvider(provider).some((m) => m.id === value.model);
		set({
			provider,
			model: keep ? value.model : recommendedModelFor(provider),
		});
	}

	return (
		<FieldGroup>
			<Field>
				<FieldLabel>Provider</FieldLabel>
				<div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @xl:grid-cols-4">
					{PROVIDER_OPTIONS.map((p) => (
						<OptionCard
							key={p.id}
							selected={value.provider === p.id}
							onClick={() => changeProvider(p.id)}
							leading={<ProviderLogo provider={p.id} />}
							title={p.name}
							description={p.description}
						/>
					))}
				</div>
			</Field>

			<Field>
				<FieldLabel htmlFor="api-key">API key</FieldLabel>
				<div className="relative">
					<Input
						id="api-key"
						type={showKey ? "text" : "password"}
						value={value.apiKey}
						placeholder={PROVIDER_PLACEHOLDER[value.provider]}
						className="pr-14"
						onChange={(e) => set({ apiKey: e.target.value })}
					/>
					<div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
						{value.apiKey && (
							<Button
								variant="ghost"
								size="icon-sm"
								type="button"
								tooltip="Clear"
								className="text-muted-foreground"
								onClick={() => set({ apiKey: "" })}
							>
								<X />
							</Button>
						)}
						<Button
							variant="ghost"
							size="icon-sm"
							type="button"
							tooltip={showKey ? "Hide key" : "Show key"}
							className="text-muted-foreground"
							onClick={() => setShowKey((s) => !s)}
						>
							{showKey ? <EyeOff /> : <Eye />}
						</Button>
					</div>
				</div>
				{/* Fixed-height status row (shared dot + section copy) — never shifts. */}
				<div className="flex items-center justify-between gap-2 text-xs">
					<span className="flex items-center gap-1.5">
						<KeyStatusDot status={status} />
						<span className={STATUS_TEXT[status].cls}>
							{STATUS_TEXT[status].text}
						</span>
					</span>
					<a
						href={PROVIDER_KEY_URL[value.provider]}
						target="_blank"
						rel="noreferrer"
						className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground hover:text-foreground"
					>
						Get a {providerName} key
						<ArrowUpRight className="size-3" />
					</a>
				</div>
			</Field>

			<div className="grid gap-4 @md:grid-cols-2">
				<Field>
					<FieldLabel>Model</FieldLabel>
					<ModelPicker
						provider={value.provider}
						value={value.model}
						onChange={(model) => set({ model })}
						variant="outline"
						className="w-full"
					/>
					<FieldDescription>
						Patrick's default — lock a different one per chat from the composer.
					</FieldDescription>
				</Field>

				<Field>
					<FieldLabel>Reasoning</FieldLabel>
					<Select
						value={value.effort}
						onValueChange={(effort) => set({ effort: effort as AiEffort })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{EFFORTS.map((e) => (
								<SelectItem key={e.id} value={e.id}>
									{e.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FieldDescription>
						How hard Patrick thinks — higher is more thorough but slower and
						pricier. Its reasoning always streams into the chat.
					</FieldDescription>
				</Field>
			</div>
		</FieldGroup>
	);
}
