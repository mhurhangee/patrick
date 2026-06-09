import type { WritingExample } from "@patrick/shared";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ExamplesSection({
	value,
	onChange,
}: {
	value: WritingExample[];
	onChange: (value: WritingExample[]) => void;
}) {
	const update = (id: string, patch: Partial<WritingExample>) =>
		onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)));

	const remove = (id: string) => onChange(value.filter((e) => e.id !== id));

	const add = () =>
		onChange([...value, { id: crypto.randomUUID(), title: "", content: "" }]);

	return (
		<FieldGroup>
			<FieldDescription>
				Writing samples AgentPat matches your voice to.
			</FieldDescription>

			{value.map((example) => (
				<FieldGroup
					key={example.id}
					className="rounded-md border p-3 *:data-[slot=field-group]:gap-3"
				>
					<Field>
						<FieldLabel htmlFor={`example-title-${example.id}`}>
							Title
						</FieldLabel>
						<div className="flex items-center gap-2">
							<Input
								id={`example-title-${example.id}`}
								value={example.title}
								placeholder="OA response — argument style"
								onChange={(e) => update(example.id, { title: e.target.value })}
							/>
							<Button
								variant="ghost"
								size="icon"
								className="shrink-0 text-muted-foreground"
								title="Remove sample"
								onClick={() => remove(example.id)}
							>
								<Trash2 />
							</Button>
						</div>
					</Field>
					<Field>
						<FieldLabel htmlFor={`example-content-${example.id}`}>
							Passage
						</FieldLabel>
						<Textarea
							id={`example-content-${example.id}`}
							className="min-h-24"
							value={example.content}
							placeholder="Paste a representative passage…"
							onChange={(e) => update(example.id, { content: e.target.value })}
						/>
					</Field>
				</FieldGroup>
			))}

			<Button variant="outline" size="sm" className="w-fit" onClick={add}>
				<Plus />
				Add writing sample
			</Button>
		</FieldGroup>
	);
}
