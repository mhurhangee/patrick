import {
	DEFAULT_CLAIM_ANALYSIS_PROMPT,
	DEFAULT_CLAIM_CONSTRUCTION_PROMPT,
	type Profile,
} from "@patrick/shared";
import { RotateCcw } from "lucide-react";
import { RichEditor } from "@/components/rich-editor/rich-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

type ClaimPrompts = Pick<
	Profile["prompts"],
	"claimConstruction" | "claimAnalysis"
>;

// One claim prompt — the same RichEditor + draft-autosave the rest of the app uses (the
// task brief, the system-prompt blocks). Unset ⇒ the built-in default is shown and runs
// live (so default improvements still reach untouched profiles); the first edit seeds it,
// and "Reset to default" clears back to unset.
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
					className="max-h-96 min-h-40 overflow-auto text-sm"
				/>
			</div>
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
