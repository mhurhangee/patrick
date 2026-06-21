import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A selectable bordered card: an optional leading visual (logo/avatar), a title,
 * and a description. Used for the provider picker and the profile picker — a
 * primary ring when selected, a subtle hover otherwise.
 */
export function OptionCard({
	selected,
	onClick,
	leading,
	title,
	description,
	className,
}: {
	selected?: boolean;
	onClick: () => void;
	leading?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
				selected
					? "border-primary bg-primary/5 ring-1 ring-primary"
					: "hover:border-foreground/20 hover:bg-muted/50",
				className,
			)}
		>
			{leading}
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{title}</div>
				{description && (
					<div className="text-xs text-muted-foreground">{description}</div>
				)}
			</div>
		</button>
	);
}
