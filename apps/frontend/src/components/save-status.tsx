import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@patrick/ui/components/tooltip";
import { Check } from "lucide-react";
import { Patrick } from "@/components/patrick";
import type { SaveState } from "@/hooks/use-autosave";

// Icon-only so the toolbar doesn't reflow as the label changes width
// (Saved ↔ Saving…); the status reads from the tooltip instead.
export function SaveStatus({ status }: { status: SaveState }) {
	if (status === "idle") return null;
	const saving = status === "saving";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					role="img"
					className="flex size-6 shrink-0 items-center justify-center"
					aria-label={saving ? "Saving" : "Saved"}
				>
					{saving ? (
						<Patrick variant="drawing" size={14} />
					) : (
						<Check className="size-3.5 text-emerald-600 dark:text-emerald-600" />
					)}
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{saving ? "Saving…" : "Saved"}
			</TooltipContent>
		</Tooltip>
	);
}
