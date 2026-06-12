import { getNav } from "@/lib/docs";
import { DocsNavLink } from "./docs-nav-link";

export async function DocsSidebar() {
	const nav = await getNav();
	return (
		<nav className="space-y-6">
			{nav.map((group) => (
				<div key={group.group}>
					<p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
						{group.group}
					</p>
					<div className="space-y-0.5">
						{group.items.map((item) => (
							<DocsNavLink key={item.url} href={item.url}>
								{item.title}
							</DocsNavLink>
						))}
					</div>
				</div>
			))}
		</nav>
	);
}
