import { DEFAULT_AGENTPAT_PROMPT } from "@patrick/shared";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { PromptBuilder } from "./prompt-builder";

export function PromptSection({
	value,
	practiceContext,
	onChange,
}: {
	value: string;
	practiceContext: string;
	onChange: (value: string) => void;
}) {
	return (
		<FieldGroup>
			<Field>
				<FieldLabel>AgentPat system prompt</FieldLabel>
				<PromptBuilder
					value={value}
					onChange={onChange}
					values={{ PRACTICECONTEXT: practiceContext }}
				/>
				<FieldDescription>
					Edit the template freely. Tokens in ‹brackets› are filled at runtime —
					the preview shows where each lands (your practice context resolves
					live; task-derived tokens fill once a task is open).
				</FieldDescription>
			</Field>
			<Button
				variant="outline"
				size="sm"
				className="w-fit"
				onClick={() => onChange(DEFAULT_AGENTPAT_PROMPT)}
			>
				Reset to default
			</Button>
		</FieldGroup>
	);
}
