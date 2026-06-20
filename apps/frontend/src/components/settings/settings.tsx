import type { ReactNode } from "react";
import { useState } from "react";
import { SaveStatus } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SaveState } from "@/hooks/use-autosave";
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
		<div className="flex gap-10">
			{rail}
			{/* @container so section layouts respond to the panel width, not the viewport. */}
			<div className="@container min-w-0 flex-1 space-y-24 pb-20">
				{children}
			</div>
		</div>
	);
}

export function SettingsRail({
	items,
	hasDanger,
	header,
	footer,
}: {
	items: readonly SettingsSectionDef[];
	hasDanger?: boolean;
	header?: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<nav className="sticky top-2 hidden h-fit w-44 shrink-0 flex-col text-sm @2xl:flex">
			{header && <div className="mb-4 min-w-0">{header}</div>}
			<div className="flex flex-col gap-0.5">
				{items.map((i) => (
					<JumpLink key={i.id} id={i.id} label={i.label} />
				))}
				{hasDanger && <JumpLink id="danger" label="Delete" destructive />}
			</div>
			{footer && <div className="mt-4">{footer}</div>}
		</nav>
	);
}

// The rail's title block (title + name + optional detail line), shown sticky
// above the section links.
export function SettingsRailHeading({
	title,
	name,
	detail,
}: {
	title: string;
	name: string;
	detail?: string;
}) {
	return (
		<div className="min-w-0">
			<p className="font-heading text-xl font-semibold tracking-tight">
				{title}
			</p>
			<p className="truncate text-md text-muted-foreground">{name}</p>
			{detail && (
				<p className="truncate text-xs text-muted-foreground/70">{detail}</p>
			)}
		</div>
	);
}

// Shown above the body only when the rail (which normally carries the title and
// save status) is collapsed at narrow panel widths.
export function SettingsFallbackHeading({
	title,
	subtitle,
	status,
}: {
	title: string;
	subtitle: string;
	status: SaveState;
}) {
	return (
		<div className="mb-6 flex items-start justify-between gap-4 @2xl:hidden">
			<div className="min-w-0">
				<h1>{title}</h1>
				<p className="truncate text-sm text-muted-foreground">{subtitle}</p>
			</div>
			<SaveStatus status={status} />
		</div>
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
		<Button
			variant="ghost"
			size="sm"
			onClick={() =>
				document
					.getElementById(id)
					?.scrollIntoView({ behavior: "smooth", block: "start" })
			}
			className={cn(
				"w-full justify-start font-normal text-muted-foreground",
				destructive && "text-destructive/80 hover:text-destructive",
			)}
		>
			{label}
		</Button>
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
