import type { KeyStatus } from "@/hooks/use-key-verification";
import { cn } from "@/lib/utils";

// The connection indicator shared by the sidebar profile switcher and the
// profile AI settings — same colours everywhere so "is my key working?" reads
// the same in both places.
const DOT_COLOR: Record<KeyStatus, string> = {
	valid: "bg-emerald-500",
	invalid: "bg-amber-500",
	verifying: "bg-muted-foreground/40 animate-pulse",
	idle: "bg-muted-foreground/40",
};

/** A one-line description of the key's connection state. */
export function keyStatusLabel(status: KeyStatus, hasKey: boolean): string {
	if (!hasKey) return "No API key set";
	if (status === "valid") return "API key verified";
	if (status === "verifying") return "Verifying API key…";
	return "API key not verified";
}

export function KeyStatusDot({
	status,
	title,
	className,
}: {
	status: KeyStatus;
	title?: string;
	className?: string;
}) {
	return (
		<span
			title={title}
			className={cn(
				"size-2.5 shrink-0 rounded-full",
				DOT_COLOR[status],
				className,
			)}
		/>
	);
}
