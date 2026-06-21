import type { OpsSettings } from "@patrick/shared";
import { useState } from "react";
import { KeyStatusDot } from "@/components/key-status-dot";
import { SecretInput } from "@/components/secret-input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { type KeyStatus, keyStatusOf } from "@/hooks/use-key-verification";
import { useOpsVerification } from "@/hooks/use-ops-verification";

const EMPTY: OpsSettings = { consumerKey: "", consumerSecret: "" };

const STATUS_TEXT: Record<KeyStatus, { text: string; cls: string }> = {
	idle: {
		text: "Add your key and secret to connect",
		cls: "text-muted-foreground",
	},
	verifying: {
		text: "Checking your credentials…",
		cls: "text-muted-foreground",
	},
	valid: {
		text: "Connected to EPO OPS",
		cls: "text-emerald-600 dark:text-emerald-400",
	},
	invalid: { text: "Invalid key or secret", cls: "text-destructive" },
};

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

	// Auto-verify the pair shortly after either field stops changing.
	const debKey = useDebouncedValue(ops.consumerKey, 500);
	const debSecret = useDebouncedValue(ops.consumerSecret, 500);
	const verification = useOpsVerification(debKey, debSecret, {
		enabled: !!debKey && !!debSecret,
	});
	const pending =
		!!ops.consumerKey &&
		!!ops.consumerSecret &&
		(ops.consumerKey !== debKey || ops.consumerSecret !== debSecret);
	const status: KeyStatus = pending ? "verifying" : keyStatusOf(verification);

	return (
		<FieldGroup>
			<div className="grid gap-4 @md:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="ops-key">Consumer key</FieldLabel>
					<SecretInput
						id="ops-key"
						value={ops.consumerKey}
						placeholder="consumer key"
						show={show}
						onToggleShow={() => setShow((s) => !s)}
						onChange={(v) => set({ consumerKey: v.trim() })}
						onClear={() => set({ consumerKey: "" })}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="ops-secret">Consumer secret</FieldLabel>
					<SecretInput
						id="ops-secret"
						value={ops.consumerSecret}
						placeholder="consumer secret"
						show={show}
						onToggleShow={() => setShow((s) => !s)}
						onChange={(v) => set({ consumerSecret: v.trim() })}
						onClear={() => set({ consumerSecret: "" })}
					/>
				</Field>
			</div>
			{/* Fixed-height status row (shared dot) — never shifts. */}
			<div className="flex items-center gap-1.5 text-xs">
				<KeyStatusDot status={status} />
				<span className={STATUS_TEXT[status].cls}>
					{STATUS_TEXT[status].text}
				</span>
			</div>
		</FieldGroup>
	);
}
