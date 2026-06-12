import { Link } from "@tanstack/react-router";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "@/lib/links";

// Minimal, borderless-but-for-a-hairline header. Plain inline links + a
// persistent Download.
export function SiteHeader() {
	return (
		<header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
				<Link to="/" className="flex items-center gap-2">
					<Patrick size={24} />
					<span className="font-heading text-xl font-semibold tracking-tight">
						Patrick
					</span>
				</Link>

				<nav className="flex items-center gap-6">
					<div className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
						<Link
							to="/docs"
							className="transition-colors hover:text-foreground"
						>
							Docs
						</Link>
						<Link
							to="/privacy"
							className="transition-colors hover:text-foreground"
						>
							Privacy
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
						<Link to="/download">Download</Link>
					</Button>
				</nav>
			</div>
		</header>
	);
}
