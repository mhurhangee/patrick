import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { PatrickMenu } from "./patrick-menu";

// The chat header: Patrick's identity + a new-chat button, plus the warning when
// this chat's frozen prompt no longer matches the active profile. The system
// prompt + abilities live in the profile prompt builder (linked from the context
// popover), not here.
export function SystemCard({
	onNewChat,
	profileMismatch,
	profileName,
}: {
	onNewChat: () => void;
	/** This chat's frozen prompt no longer matches the active profile's. */
	profileMismatch?: boolean;
	profileName?: string;
}) {
	return (
		<div className="@container">
			<div className="flex items-center justify-between gap-2 py-2 pr-2 pl-2">
				<PatrickMenu />
				<Button
					variant="ghost"
					size="icon-sm"
					tooltip="New chat"
					onClick={onNewChat}
					className="shrink-0 text-muted-foreground"
				>
					<Plus className="size-4" />
				</Button>
			</div>

			{profileMismatch && (
				<div className="flex items-center justify-between gap-2 border-t bg-amber-500/10 px-4 py-1.5 text-[11px]">
					<span className="min-w-0 truncate text-muted-foreground">
						Frozen instructions — no longer match{" "}
						{profileName ? `${profileName}'s` : "your"} current prompt.
					</span>
					<Button
						variant="link"
						onClick={onNewChat}
						className="h-auto shrink-0 p-0 font-medium text-foreground"
					>
						New chat
					</Button>
				</div>
			)}
		</div>
	);
}
