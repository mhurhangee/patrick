import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Internal links use next/link; in-page anchors (incl. the heading anchors) stay
// plain so they don't pick up prose-link styling; external links open in a tab.
function A({ href = "", className, ...props }: ComponentProps<"a">) {
	const cls = cn(
		"font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground",
		className,
	);
	if (href.startsWith("#"))
		return <a href={href} className={className} {...props} />;
	if (href.startsWith("/"))
		return <Link href={href} className={cls} {...props} />;
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className={cls}
			{...props}
		/>
	);
}

// Our MDX element map — every tag styled by hand (no typography plugin), so the
// docs look exactly how we want. Code blocks are styled in globals.css from the
// rehype-pretty-code output.
export const mdxComponents = {
	a: A,
	h1: (p: ComponentProps<"h1">) => (
		<h1
			className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl"
			{...p}
		/>
	),
	h2: (p: ComponentProps<"h2">) => (
		<h2
			className="group mt-12 mb-3 scroll-mt-24 text-2xl font-semibold tracking-tight"
			{...p}
		/>
	),
	h3: (p: ComponentProps<"h3">) => (
		<h3
			className="group mt-8 mb-2 scroll-mt-24 text-lg font-semibold tracking-tight"
			{...p}
		/>
	),
	p: (p: ComponentProps<"p">) => (
		<p className="my-4 leading-relaxed text-muted-foreground" {...p} />
	),
	ul: (p: ComponentProps<"ul">) => (
		<ul
			className="my-4 ml-5 list-disc space-y-2 text-muted-foreground marker:text-muted-foreground/40"
			{...p}
		/>
	),
	ol: (p: ComponentProps<"ol">) => (
		<ol
			className="my-4 ml-5 list-decimal space-y-2 text-muted-foreground"
			{...p}
		/>
	),
	li: (p: ComponentProps<"li">) => (
		<li className="leading-relaxed [&>ol]:my-2 [&>ul]:my-2" {...p} />
	),
	blockquote: (p: ComponentProps<"blockquote">) => (
		<blockquote
			className="my-5 border-l-2 border-primary/40 pl-4 text-muted-foreground italic"
			{...p}
		/>
	),
	strong: (p: ComponentProps<"strong">) => (
		<strong className="font-semibold text-foreground" {...p} />
	),
	hr: () => <hr className="my-10 border-border" />,
	table: (p: ComponentProps<"table">) => (
		<div className="my-6 overflow-x-auto">
			<table className="w-full border-collapse text-sm" {...p} />
		</div>
	),
	th: (p: ComponentProps<"th">) => (
		<th
			className="border-b border-border px-3 py-2 text-left font-medium text-foreground"
			{...p}
		/>
	),
	td: (p: ComponentProps<"td">) => (
		<td
			className="border-b border-border/60 px-3 py-2 text-muted-foreground"
			{...p}
		/>
	),
};
