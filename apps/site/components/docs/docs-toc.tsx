"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/docs";
import { cn } from "@/lib/utils";

// Right-rail on-page table of contents with scroll-spy: highlights the heading
// nearest the top of the viewport as you scroll.
export function DocsToc({ items }: { items: TocItem[] }) {
	const [active, setActive] = useState("");

	useEffect(() => {
		const headings = items
			.map((i) => document.getElementById(i.id))
			.filter((el): el is HTMLElement => el != null);
		if (headings.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				if (visible[0]) setActive(visible[0].target.id);
			},
			{ rootMargin: "-80px 0px -70% 0px" },
		);
		for (const h of headings) observer.observe(h);
		return () => observer.disconnect();
	}, [items]);

	if (items.length === 0) return null;

	return (
		<nav className="sticky top-24 hidden h-fit max-h-[calc(100svh-8rem)] w-52 shrink-0 overflow-auto text-sm xl:block">
			<p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
				On this page
			</p>
			<ul className="space-y-1.5">
				{items.map((item) => (
					<li key={item.id} className={cn(item.depth === 3 && "pl-3")}>
						<a
							href={`#${item.id}`}
							className={cn(
								"block transition-colors",
								active === item.id
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{item.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
