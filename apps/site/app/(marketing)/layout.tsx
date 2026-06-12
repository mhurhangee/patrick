import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// Marketing chrome: centered header + footer. Docs has its own shell.
export default function MarketingLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-svh flex-col">
			<SiteHeader />
			<main className="flex-1">{children}</main>
			<SiteFooter />
		</div>
	);
}
