import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Shared building blocks for the in-panel settings surfaces (profile, task) so
// they look and behave the same: a sticky section rail, generously-spaced
// sections, and a proper danger zone.

export type SettingsSectionDef = { id: string; label: string };

export function SettingsBody({
	rail,
	children,
}: {
	rail: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="mt-10 flex gap-10">
			{rail}
			<div className="min-w-0 flex-1 space-y-16 pb-20">{children}</div>
		</div>
	);
}

export function SettingsRail({
	items,
	hasDanger,
}: {
	items: readonly SettingsSectionDef[];
	hasDanger?: boolean;
}) {
	return (
		<nav className="sticky top-2 hidden h-fit w-28 shrink-0 flex-col gap-0.5 text-sm sm:flex">
			{items.map((i) => (
				<JumpLink key={i.id} id={i.id} label={i.label} />
			))}
			{hasDanger && <JumpLink id="danger" label="Delete" destructive />}
		</nav>
	);
}

function JumpLink({
	id,
	label,
	destructive,
}: {
	id: string;
	label: string;
	destructive?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={() =>
				document
					.getElementById(id)
					?.scrollIntoView({ behavior: "smooth", block: "start" })
			}
			className={cn(
				"rounded-md px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
				destructive && "text-destructive/80 hover:text-destructive",
			)}
		>
			{label}
		</button>
	);
}

export function SettingsSection({
	id,
	title,
	description,
	children,
}: {
	id: string;
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section id={id} className="scroll-mt-4">
			<h2 className="font-heading text-xl font-semibold tracking-tight">
				{title}
			</h2>
			{description && (
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			)}
			<div className="mt-5">{children}</div>
		</section>
	);
}

// A real danger zone: tinted box, an explanation that the attorney's files are
// safe, and a type-to-confirm rather than a modal.
export function DangerZone({
	title,
	description,
	onConfirm,
}: {
	title: string;
	description: string;
	onConfirm: () => void | Promise<void>;
}) {
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const armed = value.trim().toLowerCase() === "delete";

	const run = async () => {
		setBusy(true);
		try {
			await onConfirm();
		} finally {
			setBusy(false);
		}
	};

	return (
		<section
			id="danger"
			className="scroll-mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5"
		>
			<h2 className="font-heading text-lg font-semibold tracking-tight text-destructive">
				{title}
			</h2>
			<p className="mt-1 max-w-prose text-sm text-muted-foreground">
				{description}
			</p>
			<div className="mt-4 flex items-center gap-2">
				<Input
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder='Type "delete" to confirm'
					aria-label="Type delete to confirm"
					className="max-w-56"
				/>
				<Button variant="destructive" disabled={!armed || busy} onClick={run}>
					{busy ? "Deleting…" : "Delete"}
				</Button>
			</div>
		</section>
	);
}
