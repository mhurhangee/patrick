import type { Profile } from "@patrick/shared";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Identity = Profile["identity"];

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
					<FieldLabel htmlFor="identity-name">Name</FieldLabel>
					<Input
						id="identity-name"
						value={value.name}
						onChange={(e) => set({ name: e.target.value })}
					/>
					<FieldDescription>
						Author on tracked-change comments.
					</FieldDescription>
				</Field>
				<Field>
					<FieldLabel htmlFor="identity-firm">Firm</FieldLabel>
					<Input
						id="identity-firm"
						value={value.firm}
						placeholder="Smith & Hale IP"
						onChange={(e) => set({ firm: e.target.value })}
					/>
				</Field>
			</div>

			<Field>
				<FieldLabel htmlFor="identity-role">Role</FieldLabel>
				<Input
					id="identity-role"
					value={value.role}
					placeholder="Patent Attorney · USPTO Reg. No. …"
					onChange={(e) => set({ role: e.target.value })}
				/>
			</Field>

			<Field>
				<FieldLabel htmlFor="identity-context">Practice context</FieldLabel>
				<Textarea
					id="identity-context"
					className="min-h-40"
					value={value.practiceContext}
					placeholder="Prefer narrow, defensible amendments. Argue the art first; amend only when necessary. Formal USPTO register, present tense, no hedging."
					onChange={(e) => set({ practiceContext: e.target.value })}
				/>
				<FieldDescription>
					House style and standing instructions sent to AgentPat on every task —
					your default voice and approach.
				</FieldDescription>
			</Field>
		</FieldGroup>
	);
}
