import Link from "next/link";
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav";
import { Patrick } from "@/components/patrick";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { NavNode } from "@/lib/docs";

// Docs-only top bar — its own focused chrome (no marketing footer below).
export function DocsHeader({ nav }: { nav: NavNode[] }) {
	return (
		<header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 sm:px-6">
				<DocsMobileNav nodes={nav} />
				<Link href="/" className="flex items-center gap-2">
					<Patrick size={22} />
					<span className="font-heading text-lg font-semibold tracking-tight">
						Patrick
					</span>
				</Link>
				<span aria-hidden className="hidden text-muted-foreground/40 sm:inline">
					/
				</span>
				<Link
					href="/docs"
					className="hidden text-sm font-medium text-foreground/80 transition-colors hover:text-foreground sm:inline"
				>
					Docs
				</Link>
				<div className="ml-auto flex items-center gap-2">
					<Link
						href="/"
						className="hidden px-1 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
					>
						Home
					</Link>
					<ThemeToggle />
					<Button asChild className="h-9 rounded-lg px-4 text-sm">
						<Link href="/download">Download</Link>
					</Button>
				</div>
			</div>
		</header>
	);
}
