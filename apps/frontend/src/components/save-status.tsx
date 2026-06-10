import { Check, Loader2 } from "lucide-react";
import type { SaveState } from "@/hooks/use-autosave";

export function SaveStatus({ status }: { status: SaveState }) {
	if (status === "idle") return null;
	return (
		<span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
			{status === "saving" ? (
				<>
					<Loader2 className="size-3.5 animate-spin" />
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
