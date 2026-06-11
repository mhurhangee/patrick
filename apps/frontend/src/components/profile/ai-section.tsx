import {
	type AiEffort,
	type AiSettings,
	DEFAULT_DETAILED_MODEL,
	DEFAULT_QUICK_MODEL,
	modelsForProvider,
	type Provider,
} from "@patrick/shared";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { keyStatusOf, useKeyVerification } from "@/hooks/use-key-verification";
import { cn } from "@/lib/utils";
import { ModelSelect } from "./model-select";

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

const EFFORTS: { id: AiEffort; label: string }[] = [
	{ id: "low", label: "Low — fastest" },
	{ id: "medium", label: "Medium — balanced" },
	{ id: "high", label: "High — thorough" },
];

export function AiSection({
	value,
	onChange,
}: {
	value: AiSettings;
	onChange: (value: AiSettings) => void;
}) {
	const set = (patch: Partial<AiSettings>) => onChange({ ...value, ...patch });
	const [showKey, setShowKey] = useState(false);

	// Cached by [provider, key]; editing the key changes the key → status resets.
	const verification = useKeyVerification(value.provider, value.apiKey);
	const status = keyStatusOf(verification);

	const models = modelsForProvider(value.provider);

	function changeProvider(provider: Provider) {
		const next = modelsForProvider(provider);
		const inList = (id: string) => next.some((m) => m.id === id);
		set({
			provider,
			quickModel: inList(value.quickModel)
				? value.quickModel
				: DEFAULT_QUICK_MODEL[provider],
			detailedModel: inList(value.detailedModel)
				? value.detailedModel
				: DEFAULT_DETAILED_MODEL[provider],
		});
	}

	return (
		<FieldGroup>
			<Field>
				<FieldLabel>Provider</FieldLabel>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{PROVIDER_OPTIONS.map((p) => (
						<button
							key={p.id}
							type="button"
							onClick={() => changeProvider(p.id)}
							className={cn(
								"rounded-lg border p-3 text-left transition-colors",
								value.provider === p.id
									? "border-primary bg-primary/5 ring-1 ring-primary"
									: "hover:border-foreground/20 hover:bg-muted/50",
							)}
						>
							<p className="text-sm font-medium">{p.name}</p>
							<p className="text-xs text-muted-foreground">{p.description}</p>
						</button>
					))}
				</div>
			</Field>

			<Field>
				<FieldLabel htmlFor="api-key">API key</FieldLabel>
				<div className="flex gap-1.5">
					<div className="relative flex-1">
						<Input
							id="api-key"
							type={showKey ? "text" : "password"}
							value={value.apiKey}
							placeholder={PROVIDER_PLACEHOLDER[value.provider]}
							className="pr-9"
							onChange={(e) => set({ apiKey: e.target.value })}
						/>
						<div className="absolute inset-y-0 right-1 flex items-center">
							<Button
								variant="ghost"
								size="icon"
								type="button"
								className="size-7 text-muted-foreground"
								onClick={() => setShowKey((s) => !s)}
							>
								{showKey ? <EyeOff /> : <Eye />}
							</Button>
						</div>
					</div>
					<Button
						variant="secondary"
						disabled={!value.apiKey || status === "verifying"}
						onClick={() => verification.refetch()}
					>
						{status === "verifying" ? (
							<Patrick variant="scanning" size={16} />
						) : (
							"Verify"
						)}
					</Button>
					{value.apiKey && (
						<Button
							variant="ghost"
							className="text-muted-foreground"
							onClick={() => set({ apiKey: "" })}
						>
							Clear
						</Button>
					)}
				</div>
				{status === "idle" && (
					<FieldDescription>
						Stored locally, in this profile only — never sent to our servers.
					</FieldDescription>
				)}
				{status === "verifying" && (
					<FieldDescription>Verifying…</FieldDescription>
				)}
				{status === "valid" && (
					<FieldDescription className="text-emerald-600 dark:text-emerald-400">
						✓ Connected
					</FieldDescription>
				)}
				{status === "invalid" && (
					<FieldError>Invalid key — check and try again</FieldError>
				)}
			</Field>

			<FieldSeparator />

			<div className="grid gap-4 sm:grid-cols-2">
				<ModelSelect
					label="Quick model"
					description="Light, fast work — drafting helpers."
					value={value.quickModel}
					models={models}
					onChange={(quickModel) => set({ quickModel })}
				/>
				<ModelSelect
					label="Detailed model"
					description="Patrick — thorough, best reasoning."
					value={value.detailedModel}
					models={models}
					onChange={(detailedModel) => set({ detailedModel })}
				/>
			</div>

			<FieldSeparator />

			<Field>
				<FieldLabel>Patrick reasoning</FieldLabel>
				<Select
					value={value.effort}
					onValueChange={(effort) => set({ effort: effort as AiEffort })}
				>
					<SelectTrigger className="w-48">
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
					How hard Patrick thinks before answering. Higher is more thorough but
					slower and pricier. Its reasoning always streams into the chat.
				</FieldDescription>
			</Field>
		</FieldGroup>
	);
}
