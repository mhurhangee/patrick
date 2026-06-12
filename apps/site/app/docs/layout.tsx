import type { ReactNode } from "react";
import { DocsHeader } from "@/components/docs/docs-header";
import { DocsNav } from "@/components/docs/docs-nav";
import { getNav } from "@/lib/docs";

// Docs has its own app-like shell: a focused top bar + a full-height sidebar,
// no marketing footer. The sidebar shows at lg+; below lg it's in the top bar.
export default async function DocsLayout({
	children,
}: {
	children: ReactNode;
}) {
	const nav = await getNav();
	return (
		<div className="flex min-h-svh flex-col">
			<DocsHeader nav={nav} />
			<div className="mx-auto flex w-full max-w-[90rem] flex-1 gap-8 px-4 py-10 sm:px-6">
				<aside className="sticky top-24 hidden h-[calc(100svh-7rem)] w-64 shrink-0 overflow-auto lg:block">
					<DocsNav nodes={nav} />
				</aside>
				<main className="min-w-0 flex-1">{children}</main>
			</div>
		</div>
	);
}
