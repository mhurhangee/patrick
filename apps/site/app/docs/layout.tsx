import type { ReactNode } from "react";
import { DocsNav } from "@/components/docs/docs-nav";
import { getNav } from "@/lib/docs";

// The sidebar shows at lg+. Below lg, docs nav lives in the header's mobile menu.
export default async function DocsLayout({
	children,
}: {
	children: ReactNode;
}) {
	const nav = await getNav();
	return (
		<div className="mx-auto flex max-w-[84rem] gap-8 px-6 py-10">
			<aside className="sticky top-20 hidden h-[calc(100svh-6rem)] w-64 shrink-0 overflow-auto lg:block">
				<DocsNav nodes={nav} />
			</aside>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
