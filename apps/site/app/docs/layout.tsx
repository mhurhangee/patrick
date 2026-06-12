import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/docs/docs-sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
	return (
		<div className="mx-auto flex max-w-7xl gap-8 px-6 py-10">
			<aside className="sticky top-20 hidden h-[calc(100svh-6rem)] w-64 shrink-0 overflow-auto lg:block">
				<DocsSidebar />
			</aside>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
