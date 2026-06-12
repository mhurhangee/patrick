"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DocsNavLink({
	href,
	children,
}: {
	href: string;
	children: ReactNode;
}) {
	const pathname = usePathname();
	const active = pathname === href;
	return (
		<Link
			href={href}
			className={cn(
				"block rounded-md border-l-2 px-3 py-1.5 text-sm transition-colors",
				active
					? "border-primary bg-accent font-medium text-foreground"
					: "border-transparent text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</Link>
	);
}
