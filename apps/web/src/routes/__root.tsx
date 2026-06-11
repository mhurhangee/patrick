import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Patrick } from "@/components/patrick";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB_URL } from "@/lib/links";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
	return (
		<div className="flex min-h-svh flex-col">
			<SiteHeader />

			<main className="flex-1">
				<Outlet />
			</main>

			<footer>
				<div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-12 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2">
						<Patrick size={16} />
						<span>Open-source, local-first patent prosecution.</span>
					</div>
					<nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
						<span className="text-muted-foreground/70">Apache-2.0</span>
						<ThemeToggle />
					</nav>
				</div>
			</footer>
		</div>
	);
}
