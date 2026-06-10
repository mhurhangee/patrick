import {
	DEFAULT_AGENTPAT_PROMPT,
	PROFILE_TEMPLATES,
	type WritingExample,
} from "@patrick/shared";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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
					<FieldLabel>Patrick system prompt</FieldLabel>
					<div className="flex gap-2">
						<Popover>
							<PopoverTrigger asChild>
								<Button variant="outline" size="sm">
									Apply template
									<ChevronDown className="size-3.5" />
								</Button>
							</PopoverTrigger>
							<PopoverContent align="end" className="w-72 p-1">
								<p className="px-2 py-1.5 text-xs text-muted-foreground">
									Replace the prompt with a starter (your practice context is
									kept).
								</p>
								{PROFILE_TEMPLATES.map((t) => (
									<button
										type="button"
										key={t.id}
										onClick={() => onChange(t.agentpat)}
										className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
									>
										<div className="text-sm font-medium">{t.name}</div>
										<div className="text-xs text-muted-foreground">
											{t.description}
										</div>
									</button>
								))}
							</PopoverContent>
						</Popover>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onChange(DEFAULT_AGENTPAT_PROMPT)}
						>
							Reset to default
						</Button>
					</div>
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
