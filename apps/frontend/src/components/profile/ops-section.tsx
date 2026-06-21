import type { OpsSettings } from "@patrick/shared";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EMPTY: OpsSettings = { consumerKey: "", consumerSecret: "" };

export function OpsSection({
	value,
	onChange,
}: {
	value: OpsSettings | undefined;
	onChange: (value: OpsSettings) => void;
}) {
	const ops = value ?? EMPTY;
	const set = (patch: Partial<OpsSettings>) => onChange({ ...ops, ...patch });
	const [show, setShow] = useState(false);

	return (
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor="ops-key">Consumer key</FieldLabel>
				<Input
					id="ops-key"
					type={show ? "text" : "password"}
					value={ops.consumerKey}
					placeholder="consumer key"
					onChange={(e) => set({ consumerKey: e.target.value.trim() })}
				/>
			</Field>

			<Field>
				<FieldLabel htmlFor="ops-secret">Consumer secret</FieldLabel>
				<div className="flex gap-1.5">
					<div className="relative flex-1">
						<Input
							id="ops-secret"
							type={show ? "text" : "password"}
							value={ops.consumerSecret}
							placeholder="consumer secret"
							className="pr-9"
							onChange={(e) => set({ consumerSecret: e.target.value.trim() })}
						/>
						<div className="absolute inset-y-0 right-1 flex items-center">
							<Button
								variant="ghost"
								size="icon"
								type="button"
								className="size-7 text-muted-foreground"
								onClick={() => setShow((s) => !s)}
							>
								{show ? <EyeOff /> : <Eye />}
							</Button>
						</div>
					</div>
					{(ops.consumerKey || ops.consumerSecret) && (
						<Button
							variant="ghost"
							className="text-muted-foreground"
							onClick={() => onChange(EMPTY)}
						>
							Clear
						</Button>
					)}
				</div>
			</Field>
		</FieldGroup>
	);
}
