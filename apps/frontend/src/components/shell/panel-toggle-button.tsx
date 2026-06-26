import { Button } from "@patrick/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayout } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** The collapse/expand toggle used in the viewer tab strip — reused anywhere a
 *  panel can otherwise feel locked (empty workspace, /profile). */
export function PanelToggleButton({
	side,
	className,
}: {
	side: "nav" | "chat";
	className?: string;
}) {
	const { toggleNav, navCollapsed, toggleChat, chatCollapsed } = useLayout();
	const isNav = side === "nav";
	const collapsed = isNav ? navCollapsed : chatCollapsed;
	const Icon = isNav === collapsed ? ChevronRight : ChevronLeft;
	const label = isNav ? "sidebar" : "Patrick";

	return (
		<Button
			variant="ghost"
			size="icon"
			className={cn("size-7 shrink-0 text-muted-foreground", className)}
			title={`${collapsed ? "Show" : "Hide"} ${label}`}
			onClick={isNav ? toggleNav : toggleChat}
		>
			<Icon />
		</Button>
	);
}
