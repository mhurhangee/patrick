import {
	DEFAULT_CLAIM_ANALYSIS_PROMPT,
	DEFAULT_CLAIM_CONSTRUCTION_PROMPT,
	type Profile,
} from "@patrick/shared";
import { ChevronDown, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FieldDescription } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

type ClaimPrompts = Pick<
	Profile["prompts"],
	"claimConstruction" | "claimAnalysis"
>;

// One collapsible prompt. Unset ⇒ the built-in default runs; we show that default
// (read-only) so the attorney can see what's in force, and "Customise" loads it for
// editing. A customised prompt edits freely; "Reset to default" clears back to unset.
function PromptField({
	label,
	description,
	value,
	def,
	onChange,
}: {
	label: string;
	description: string;
	value: string | undefined;
	def: string;
	onChange: (value: string | undefined) => void;
}) {
	const customised = value !== undefined && value.trim() !== "";
	return (
		<Collapsible className="rounded-lg border">
			<CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm">
				<span className="flex items-center gap-2 font-medium">
					{label}
					<span className="text-xs font-normal text-muted-foreground">
						{customised ? "Customised" : "Default"}
					</span>
				</span>
				<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent className="space-y-2 border-t px-3 py-3">
				<div className="flex justify-end">
					{customised ? (
						<Button
							variant="ghost"
							size="xs"
							className="text-muted-foreground"
							onClick={() => onChange(undefined)}
						>
							<RotateCcw />
							Reset to default
						</Button>
					) : (
						<Button
							variant="ghost"
							size="xs"
							className="text-muted-foreground"
							onClick={() => onChange(def)}
						>
							<Pencil />
							Customise
						</Button>
					)}
				</div>
				<Textarea
					value={customised ? value : def}
					readOnly={!customised}
					onChange={(e) => onChange(e.target.value)}
					className="min-h-56 font-mono text-xs leading-relaxed"
				/>
				<FieldDescription>{description}</FieldDescription>
			</CollapsibleContent>
		</Collapsible>
	);
}

/** The claim-chart prompts — the parse/construe rubric and the disclosure-analysis rubric.
 *  Profile-wide defaults (no per-chart override by design); a chart freezes nothing, it
 *  reads these live. Want a different rubric for another jurisdiction → a second profile. */
export function ClaimPromptsSection({
	value,
	onChange,
}: {
	value: ClaimPrompts;
	onChange: (value: ClaimPrompts) => void;
}) {
	return (
		<div className="space-y-3">
			<PromptField
				label="Claim construction"
				description="How claims are split into limitations and construed (Art 69 EPC). Drives Add claim."
				value={value.claimConstruction}
				def={DEFAULT_CLAIM_CONSTRUCTION_PROMPT}
				onChange={(claimConstruction) =>
					onChange({ ...value, claimConstruction })
				}
			/>
			<PromptField
				label="Disclosure analysis"
				description="The novelty rubric — how a reference, read in full, is judged against each limitation. Drives each column's analysis."
				value={value.claimAnalysis}
				def={DEFAULT_CLAIM_ANALYSIS_PROMPT}
				onChange={(claimAnalysis) => onChange({ ...value, claimAnalysis })}
			/>
		</div>
	);
}
