import { Check } from "lucide-react";
import { Patrick } from "@/components/patrick";
import type { SaveState } from "@/hooks/use-autosave";

export function SaveStatus({ status }: { status: SaveState }) {
	if (status === "idle") return null;
	return (
		<span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
			{status === "saving" ? (
				<>
					<Patrick variant="scanning" size={14} />
					Saving…
				</>
			) : (
				<>
					<Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
					Saved
				</>
			)}
		</span>
	);
}
