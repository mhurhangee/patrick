import { NavLinks } from "@/components/nav-links";
import { Patrick } from "@/components/patrick";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteFooter() {
	return (
		<footer className="border-t border-border/60">
			<div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-12 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<Patrick size={16} />
					<span>Open-source, local-first patent prosecution.</span>
				</div>
				<nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
					<NavLinks className="transition-colors hover:text-foreground" />
					<span className="text-muted-foreground/70">Apache-2.0</span>
					<ThemeToggle />
				</nav>
			</div>
		</footer>
	);
}
