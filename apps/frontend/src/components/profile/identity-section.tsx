import type { Profile } from "@patrick/shared";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@patrick/ui/components/field";
import { Input } from "@patrick/ui/components/input";

type Identity = Profile["identity"];

// Just who the profile is — how Patrick works for you lives in the Prompt section.
export function IdentitySection({
	value,
	onChange,
}: {
	value: Identity;
	onChange: (value: Identity) => void;
}) {
	const set = (patch: Partial<Identity>) => onChange({ ...value, ...patch });

	return (
		<FieldGroup>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="identity-name">Profile name</FieldLabel>
					<Input
						id="identity-name"
						value={value.name}
						placeholder="EP prosecution"
						onChange={(e) => set({ name: e.target.value })}
					/>
					<FieldDescription>What you pick in the switcher.</FieldDescription>
				</Field>
				<Field>
					<FieldLabel htmlFor="identity-author">Author name</FieldLabel>
					<Input
						id="identity-author"
						value={value.author}
						placeholder="Patrick"
						onChange={(e) => set({ author: e.target.value })}
					/>
					<FieldDescription>
						The author on tracked changes — leave blank for "Patrick".
					</FieldDescription>
				</Field>
			</div>
		</FieldGroup>
	);
}
