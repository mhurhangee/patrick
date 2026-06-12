import { CircleAlert, Info, Lightbulb, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Tutorial-style MDX components — ours to style. Used in .mdx via <Callout> etc.

const CALLOUTS = {
	note: {
		icon: Info,
		box: "border-primary/30 bg-primary/5",
		mark: "text-primary",
	},
	tip: {
		icon: Lightbulb,
		box: "border-[var(--patrick-coral)]/30 bg-[var(--patrick-coral)]/5",
		mark: "text-[var(--patrick-coral)]",
	},
	warning: {
		icon: TriangleAlert,
		box: "border-amber-500/30 bg-amber-500/5",
		mark: "text-amber-500",
	},
	danger: {
		icon: CircleAlert,
		box: "border-destructive/30 bg-destructive/5",
		mark: "text-destructive",
	},
};

export function Callout({
	type = "note",
	title,
	children,
}: {
	type?: keyof typeof CALLOUTS;
	title?: string;
	children: ReactNode;
}) {
	const c = CALLOUTS[type];
	const Icon = c.icon;
	return (
		<div className={cn("my-5 flex gap-3 rounded-lg border p-4 text-sm", c.box)}>
			<Icon className={cn("mt-0.5 size-4 shrink-0", c.mark)} />
			<div className="min-w-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
				{title && <p className="mb-1 font-medium text-foreground">{title}</p>}
				{children}
			</div>
		</div>
	);
}

export function Steps({ children }: { children: ReactNode }) {
	return <div className="docs-steps my-6 space-y-6">{children}</div>;
}

export function Step({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="docs-step relative pl-11">
			<h3 className="!mt-0 mb-2 text-base font-semibold tracking-tight text-foreground">
				{title}
			</h3>
			<div className="[&>*:first-child]:mt-0">{children}</div>
		</div>
	);
}

export function CardGrid({ children }: { children: ReactNode }) {
	return <div className="my-6 grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function Card({
	title,
	href,
	children,
}: {
	title: string;
	href?: string;
	children?: ReactNode;
}) {
	const body = (
		<>
			<p className="font-medium text-foreground">{title}</p>
			{children && (
				<p className="mt-1 text-sm text-muted-foreground [&>*]:m-0">
					{children}
				</p>
			)}
		</>
	);
	const cls =
		"block rounded-lg border border-border p-4 no-underline transition-colors";
	return href ? (
		<Link href={href} className={cn(cls, "hover:bg-accent")}>
			{body}
		</Link>
	) : (
		<div className={cls}>{body}</div>
	);
}
