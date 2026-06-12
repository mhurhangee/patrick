"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DocsNav } from "@/components/docs/docs-nav";
import type { NavNode } from "@/lib/docs";

// The docs top bar's mobile nav (below lg): a full-width drop panel with the
// nav tree. Lives in the header, so it never pushes content or overlaps.
export function DocsMobileNav({ nodes }: { nodes: NavNode[] }) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	// biome-ignore lint/correctness/useExhaustiveDependencies: close on route change
	useEffect(() => setOpen(false), [pathname]);

	return (
		<div className="lg:hidden">
			<button
				type="button"
				aria-label="Docs menu"
				onClick={() => setOpen((o) => !o)}
				className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
			>
				{open ? <X className="size-5" /> : <Menu className="size-5" />}
			</button>
			{open && (
				<div className="absolute inset-x-0 top-16 max-h-[calc(100svh-4rem)] overflow-auto border-b border-border/60 bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
					<DocsNav nodes={nodes} />
				</div>
			)}
		</div>
	);
}
