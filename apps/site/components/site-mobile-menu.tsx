"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavLinks } from "@/components/nav-links";

// The marketing header's mobile menu (below sm): a full-width drop panel.
export function SiteMobileMenu() {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	// biome-ignore lint/correctness/useExhaustiveDependencies: close on route change
	useEffect(() => setOpen(false), [pathname]);

	return (
		<div className="sm:hidden">
			<button
				type="button"
				aria-label="Menu"
				onClick={() => setOpen((o) => !o)}
				className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
			>
				{open ? <X className="size-5" /> : <Menu className="size-5" />}
			</button>
			{open && (
				<div className="absolute inset-x-0 top-16 border-b border-border/60 bg-background/95 backdrop-blur">
					<nav className="mx-auto flex max-w-5xl flex-col px-6 py-2 text-sm">
						<NavLinks className="py-2 text-muted-foreground transition-colors hover:text-foreground" />
					</nav>
				</div>
			)}
		</div>
	);
}
