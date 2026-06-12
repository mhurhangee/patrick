"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DocsNav } from "@/components/docs/docs-nav";
import type { NavNode } from "@/lib/docs";
import { GITHUB_URL } from "@/lib/links";

const LINKS = [
	{ label: "Docs", href: "/docs" },
	{ label: "Privacy", href: "/privacy" },
	{ label: "Contact", href: "/contact" },
];

// The single mobile menu (below lg). On docs pages the panel leads with the docs
// nav tree, then the site links; elsewhere it is just the site links.
export function SiteMobileMenu({ docsNav }: { docsNav: NavNode[] }) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	// biome-ignore lint/correctness/useExhaustiveDependencies: close on route change
	useEffect(() => setOpen(false), [pathname]);

	const onDocs = pathname.startsWith("/docs");

	return (
		<div className="lg:hidden">
			<button
				type="button"
				aria-label="Menu"
				onClick={() => setOpen((o) => !o)}
				className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
			>
				{open ? <X className="size-5" /> : <Menu className="size-5" />}
			</button>
			{open && (
				<div className="absolute inset-x-0 top-16 max-h-[calc(100svh-4rem)] overflow-auto border-b border-border/60 bg-background/95 backdrop-blur">
					<div className="mx-auto max-w-5xl px-6 py-4">
						{onDocs && (
							<>
								<DocsNav nodes={docsNav} />
								<div className="my-3 border-t border-border/60" />
							</>
						)}
						<nav className="flex flex-col text-sm">
							{LINKS.map((l) => (
								<Link
									key={l.href}
									href={l.href}
									className="py-2 text-muted-foreground transition-colors hover:text-foreground"
								>
									{l.label}
								</Link>
							))}
							<a
								href={GITHUB_URL}
								target="_blank"
								rel="noreferrer"
								className="py-2 text-muted-foreground transition-colors hover:text-foreground"
							>
								Source
							</a>
						</nav>
					</div>
				</div>
			)}
		</div>
	);
}
