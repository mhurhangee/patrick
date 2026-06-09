import type { ReactNode } from "react";

export function Section({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div>
			<div className="px-2 pb-1">
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
			</div>
			<div className="space-y-0.5">{children}</div>
		</div>
	);
}
