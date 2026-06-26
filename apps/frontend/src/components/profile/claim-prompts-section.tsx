import {
	CLAIM_ANALYSIS_FORMAT,
	CLAIM_CONSTRUCTION_FORMAT,
	DEFAULT_CLAIM_ANALYSIS_RUBRIC,
	DEFAULT_CLAIM_CONSTRUCTION_RUBRIC,
	type Profile,
} from "@patrick/shared";
import { Button } from "@patrick/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@patrick/ui/components/collapsible";
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@patrick/ui/components/field";
import { ChevronDown, Lock, RotateCcw } from "lucide-react";
import { RichEditor } from "@/components/rich-editor/rich-editor";

type ClaimPrompts = Pick<
	Profile["prompts"],
	"claimConstruction" | "claimAnalysis"
>;

// The locked output-format block — always appended to the rubric, shown read-only so the
// attorney can see exactly what's enforced but can't break the structured output. Mirrors
// the system-prompt builder's ghost cards.
function LockedFormat({ content }: { content: string }) {
	return (
		<Collapsible className="group rounded-md border bg-muted/40">
			<CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left">
				<Lock className="size-3.5 shrink-0 text-muted-foreground/60" />
				<span className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">
					Output format
					<span className="ml-2 font-normal text-muted-foreground/60">
						always appended · not editable
					</span>
				</span>
				<ChevronDown className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-data-[state=open]:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<pre className="max-h-56 overflow-auto whitespace-pre-wrap border-t px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
					{content}
				</pre>
			</CollapsibleContent>
		</Collapsible>
	);
}

// One claim rubric — the same RichEditor + draft autosave the rest of the app uses. Unset ⇒
// the built-in default rubric runs live (so improvements still reach untouched profiles);
// the first edit seeds it, "Reset to default" clears back to unset. The locked format block
// is appended by the API, never stored here.
function PromptField({
	label,
	description,
	value,
	def,
	format,
	onChange,
}: {
	label: string;
	description: string;
	value: string | undefined;
	def: string;
	format: string;
	onChange: (value: string | undefined) => void;
}) {
	const customised = value !== undefined && value.trim() !== "";
	return (
		<Field>
			<div className="flex items-center justify-between">
				<FieldLabel>
					{label}
					<span className="ml-2 font-normal text-muted-foreground">
						{customised ? "Customised" : "Default"}
					</span>
				</FieldLabel>
				{customised && (
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground"
						onClick={() => onChange(undefined)}
					>
						<RotateCcw />
						Reset to default
					</Button>
				)}
			</div>
			<div className="rounded-md border px-3 py-2">
				<RichEditor
					value={customised ? value : def}
					onChange={onChange}
					className="max-h-96 min-h-40 overflow-auto text-xs"
				/>
			</div>
			<LockedFormat content={format} />
			<FieldDescription>{description}</FieldDescription>
		</Field>
	);
}

/** The claim-chart rubrics — the parse/construe prompt and the disclosure-analysis prompt.
 *  Profile-wide defaults (no per-chart override by design); a chart reads them live. Want a
 *  different rubric for another jurisdiction → a second profile. */
export function ClaimPromptsSection({
	value,
	onChange,
}: {
	value: ClaimPrompts;
	onChange: (value: ClaimPrompts) => void;
}) {
	return (
		<div className="space-y-6">
			<PromptField
				label="Claim construction"
				description="How claims are split into limitations and construed (Art 69 EPC). Drives Add claim."
				value={value.claimConstruction}
				def={DEFAULT_CLAIM_CONSTRUCTION_RUBRIC}
				format={CLAIM_CONSTRUCTION_FORMAT}
				onChange={(claimConstruction) =>
					onChange({ ...value, claimConstruction })
				}
			/>
			<PromptField
				label="Disclosure analysis"
				description="The novelty rubric — how a reference, read in full, is judged against each limitation. Drives each column's analysis."
				value={value.claimAnalysis}
				def={DEFAULT_CLAIM_ANALYSIS_RUBRIC}
				format={CLAIM_ANALYSIS_FORMAT}
				onChange={(claimAnalysis) => onChange({ ...value, claimAnalysis })}
			/>
		</div>
	);
}
