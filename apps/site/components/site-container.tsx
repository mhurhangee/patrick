"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Header/footer chrome aligns to the docs width on docs pages and the marketing
// width elsewhere, so the logo always lines up with the content beneath it.
export function SiteContainer({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const wide = usePathname().startsWith("/docs");
	return (
		<div
			className={cn(
				"mx-auto px-6",
				wide ? "max-w-[84rem]" : "max-w-5xl",
				className,
			)}
		>
			{children}
		</div>
	);
}
