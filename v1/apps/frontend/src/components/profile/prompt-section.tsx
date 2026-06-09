import { DEFAULT_AGENTPAT_PROMPT } from "@patrick/shared";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function PromptSection({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor="agentpat-prompt">
					AgentPat system prompt
				</FieldLabel>
				<Textarea
					id="agentpat-prompt"
					className="min-h-80 font-mono text-xs leading-relaxed"
					value={value}
					onChange={(e) => onChange(e.target.value)}
				/>
				<FieldDescription>
					The full instruction AgentPat runs on. Tokens like{" "}
					{"<PRACTICECONTEXT>"}, {"<TASK>"} and {"<OPENDOCUMENTS>"} are filled
					in at runtime from the active task.
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
