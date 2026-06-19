import {
	type CuratedModel,
	formatContextWindow,
	MODELS_BY_ID,
	type ModelTier,
	modelsForProvider,
	type Provider,
	TIER_BLURB,
	vendorForModel,
} from "@patrick/shared";
import { Check, ChevronsUpDown, Cpu } from "lucide-react";
import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const VENDOR_LABEL: Record<string, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	google: "Google",
};
const TIER_RANK: Record<ModelTier, number> = {
	fast: 1,
	balanced: 2,
	expert: 3,
};

// Three ascending bars, filled to the model's tier — a quick capability glance.
function TierBars({ tier }: { tier: ModelTier }) {
	const rank = TIER_RANK[tier];
	return (
		<span className="inline-flex items-end gap-px" aria-hidden>
			{[1, 2, 3].map((i) => (
				<span
					key={i}
					style={{ height: `${i * 3 + 1}px` }}
					className={cn(
						"w-[3px] rounded-[1px]",
						i <= rank ? "bg-emerald-600" : "bg-muted-foreground/25",
					)}
				/>
			))}
		</span>
	);
}

// Models grouped by vendor in catalog order (one group for a direct provider,
// three under the gateway).
function groupByVendor(models: CuratedModel[]): [string, CuratedModel[]][] {
	const groups: [string, CuratedModel[]][] = [];
	for (const m of models) {
		const v = vendorForModel(m.id);
		const last = groups.at(-1);
		if (last && last[0] === v) last[1].push(m);
		else groups.push([v, [m]]);
	}
	return groups;
}

/**
 * Model picker — a chip trigger opening a grouped popover (vendor → models with
 * tier blurb/bars, BYO pricing, context window). Used in the profile AI settings
 * (`tone="field"`) and the chat composer toolbar (`tone="ghost"`).
 */
export function ModelPicker({
	value,
	onChange,
	provider,
	tone = "field",
	align = "start",
	className,
}: {
	value: string;
	onChange: (id: string) => void;
	provider: Provider;
	/** "field" — a bordered control (profile); "ghost" — a bare chip (toolbar). */
	tone?: "field" | "ghost";
	align?: "start" | "center" | "end";
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const models = modelsForProvider(provider);
	const current = MODELS_BY_ID[value];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					title="Choose a model"
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md text-sm transition-colors",
						tone === "ghost"
							? "px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted"
							: "border px-2 py-1 hover:bg-accent data-[state=open]:bg-accent",
						className,
					)}
				>
					<Cpu className="size-3.5 shrink-0 text-emerald-600" />
					<span className="min-w-0 flex-1 truncate text-left">
						{current?.name ?? value}
					</span>
					<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/60" />
				</button>
			</PopoverTrigger>
			<PopoverContent align={align} className="w-80 p-0">
				<div className="flex items-center justify-between px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					<span>Model</span>
					<span className="normal-case tracking-normal">
						{models.length} available · bring your own key
					</span>
				</div>
				<div className="max-h-[22rem] overflow-y-auto pb-1">
					{groupByVendor(models).map(([vendor, group]) => (
						<div key={vendor}>
							<p className="px-3 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
								{VENDOR_LABEL[vendor] ?? vendor}
							</p>
							{group.map((m) => {
								const selected = m.id === value;
								return (
									<button
										key={m.id}
										type="button"
										onClick={() => {
											onChange(m.id);
											setOpen(false);
										}}
										className={cn(
											"flex w-full items-center gap-3 border-l-2 px-3 py-1.5 text-left transition-colors",
											selected
												? "border-primary bg-accent/60"
												: "border-transparent hover:bg-accent/40",
										)}
									>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium">
												{m.name}
											</span>
											<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
												{TIER_BLURB[m.tier]}
												<TierBars tier={m.tier} />
											</span>
										</span>
										{m.pricingPerM && (
											<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
												${m.pricingPerM.input.toFixed(2)}
												<span className="text-muted-foreground/50">
													{" "}
													/ ${m.pricingPerM.output.toFixed(2)}
												</span>
											</span>
										)}
										<span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground/70">
											{formatContextWindow(m.contextWindow)}
										</span>
										<Check
											className={cn(
												"size-3.5 shrink-0 text-primary",
												selected ? "opacity-100" : "opacity-0",
											)}
										/>
									</button>
								);
							})}
						</div>
					))}
				</div>
				<p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
					Prices are per 1M tokens — input / output.
				</p>
			</PopoverContent>
		</Popover>
	);
}
