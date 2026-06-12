"use client";

import type { ReactNode } from "react";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";

// One quiet move: fade + an 8px rise as the block enters view. Reduced-motion
// shows it immediately, no transform.
export function Reveal({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const { ref, inView } = useInView<HTMLDivElement>();
	return (
		<div
			ref={ref}
			className={cn(
				"transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
				inView ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
				className,
			)}
		>
			{children}
		</div>
	);
}
