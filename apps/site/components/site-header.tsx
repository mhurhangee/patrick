import Link from "next/link";
import { Patrick } from "@/components/patrick";
import { SiteMobileMenu } from "@/components/site-mobile-menu";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "@/lib/links";

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
				</Link>

				<nav className="flex items-center gap-6">
					<div className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
						<Link
							href="/docs"
							className="transition-colors hover:text-foreground"
						>
							Docs
						</Link>
						<Link
							href="/privacy"
							className="transition-colors hover:text-foreground"
						>
							Privacy
						</Link>
						<Link
							href="/contact"
							className="transition-colors hover:text-foreground"
						>
							Contact
						</Link>
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noreferrer"
							className="transition-colors hover:text-foreground"
						>
							Source
						</a>
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
