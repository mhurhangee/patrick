import type { ReactNode } from "react";

export function Section({
	label,
	action,
	children,
}: {
	label: string;
	/** Optional control pinned to the right of the section header. */
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div>
			<div className="flex items-center justify-between px-2 pb-1">
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
				{action}
			</div>
			<div className="space-y-0.5">{children}</div>
		</div>
	);
}
