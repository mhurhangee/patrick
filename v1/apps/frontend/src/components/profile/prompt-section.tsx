import { DEFAULT_AGENTPAT_PROMPT, type WritingExample } from "@patrick/shared";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { PromptBuilder } from "./prompt-builder";

function examplesText(examples: WritingExample[]): string {
	return examples
		.filter((e) => e.content.trim())
		.map((e) => `### ${e.title || "Example"}\n${e.content.trim()}`)
		.join("\n\n");
}

export function PromptSection({
	value,
	practiceContext,
	examples,
	onChange,
}: {
	value: string;
	practiceContext: string;
	examples: WritingExample[];
	onChange: (value: string) => void;
}) {
	return (
		<FieldGroup>
			<Field>
				<div className="flex justify-between">
					<FieldLabel>AgentPat system prompt</FieldLabel>
					<Button
						variant="outline"
						size="sm"
						onClick={() => onChange(DEFAULT_AGENTPAT_PROMPT)}
					>
						Reset to default
					</Button>
				</div>
				<PromptBuilder
					value={value}
					onChange={onChange}
					values={{
						PRACTICECONTEXT: practiceContext,
						EXAMPLES: examplesText(examples),
					}}
				/>
				<FieldDescription>
					Edit the template freely. Tokens in ‹brackets› are filled at runtime —
					the preview shows where each lands (your practice context resolves
					live; task-derived tokens fill once a task is open).
				</FieldDescription>
			</Field>
		</FieldGroup>
	);
}
