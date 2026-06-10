import { type CuratedModel, contextWindowFor } from "@patrick/shared";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

function formatContext(tokens: number): string {
	return tokens >= 1_000_000
		? `${tokens / 1_000_000}M context`
		: `${Math.round(tokens / 1000)}K context`;
}

export function ModelSelect({
	label,
	description,
	value,
	models,
	onChange,
}: {
	label: string;
	description: string;
	value: string;
	models: CuratedModel[];
	onChange: (id: string) => void;
}) {
	const selected = models.find((m) => m.id === value);
	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{models.map((m) => (
						<SelectItem key={m.id} value={m.id}>
							{m.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<FieldDescription>
				{description}
				{selected && (
					<span className="mt-0.5 block tabular-nums">
						{selected.pricingPerM &&
							`$${selected.pricingPerM.input.toFixed(2)} in · $${selected.pricingPerM.output.toFixed(2)} out per M · `}
						{formatContext(contextWindowFor(selected.id))}
					</span>
				)}
			</FieldDescription>
		</Field>
	);
}
