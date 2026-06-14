import { DEFAULT_AGENTPAT_PROMPT, PROFILE_TEMPLATES } from "@patrick/shared";
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
				<div className="flex items-center justify-between">
					<FieldLabel>Patrick's instructions</FieldLabel>
					{/* One control for all starting points — the default and the templates. */}
					<Popover>
						<PopoverTrigger asChild>
							<Button variant="outline" size="sm">
								Start from
								<ChevronDown className="size-3.5" />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="end" className="w-72 p-1">
							<p className="px-2 py-1.5 text-xs text-muted-foreground">
								Replace your blocks with a starting point.
							</p>
							<button
								type="button"
								onClick={() => onChange(DEFAULT_AGENTPAT_PROMPT)}
								className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
							>
								<div className="text-sm font-medium">Default</div>
								<div className="text-xs text-muted-foreground">
									Patrick's general-purpose instructions.
								</div>
							</button>
							<div className="my-1 border-t border-border/60" />
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
				</div>
				<PromptBuilder value={value} onChange={onChange} />
				<FieldDescription>
					Compose Patrick's instructions as blocks. Its capabilities and the
					current task + documents are added automatically — you'll see them in
					Preview and at the top of any chat.
				</FieldDescription>
			</Field>
		</FieldGroup>
	);
}
