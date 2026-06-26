import {
	Item,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@patrick/ui/components/item";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Patrick } from "./patrick";

// A small, consistent nudge that Patrick can help with the work on a surface.
// Optional title + an explanation, fitted to its content (not full-width).
export function Hint({
	title,
	children,
	className,
}: {
	title?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<Item variant="muted" size="sm" className={cn("w-fit", className)}>
			<ItemMedia>
				<Patrick size={16} />
			</ItemMedia>
			<ItemContent>
				{title && <ItemTitle>{title}</ItemTitle>}
				<ItemDescription>{children}</ItemDescription>
			</ItemContent>
		</Item>
	);
}
