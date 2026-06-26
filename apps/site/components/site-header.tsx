import { Button } from "@patrick/ui/components/button";
import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { Patrick } from "@/components/patrick";
import { SiteMobileMenu } from "@/components/site-mobile-menu";

// Marketing header — centered, hairline-bottom. Plain inline links + Download.
export function SiteHeader() {
	return (
		<header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
				<Link href="/" className="flex items-center gap-2">
					<Patrick size={24} />
					<span className="font-heading text-xl font-semibold tracking-tight">
						Patrick
					</span>
					<span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
						Alpha
					</span>
				</Link>

				<nav className="flex items-center gap-6">
					<div className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
						<NavLinks className="transition-colors hover:text-foreground" />
					</div>
					<Button asChild className="h-9 rounded-lg px-4 text-sm">
						<Link href="/download">Download</Link>
					</Button>
					<SiteMobileMenu />
				</nav>
			</div>
		</header>
	);
}
