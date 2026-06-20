import { Plus } from "lucide-react";
import { Patrick } from "../patrick";
import { FeedbackButton } from "../shell/sidebar/feedback-button";
import { Button } from "../ui/button";
import { VersionChip } from "./version-chip";

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
			<div className="flex items-center justify-between gap-2 py-2 pr-2 pl-4">
				<div className="flex min-w-0 items-center gap-2">
					<Patrick size={18} />
					<span className="@[20rem]:inline hidden font-heading text-lg font-semibold tracking-tighter">
						Patrick
					</span>
					<span className="@[20rem]:inline hidden">
						<VersionChip />
					</span>
				</div>

				<div className="flex shrink-0 items-center gap-0.5">
					<FeedbackButton />
					<Button
						variant="ghost"
						size="icon-sm"
						tooltip="New chat"
						onClick={onNewChat}
						className="text-muted-foreground"
					>
						<Plus className="size-4" />
					</Button>
				</div>
			</div>

			{profileMismatch && (
				<div className="flex items-center justify-between gap-2 border-t bg-amber-500/10 px-4 py-1.5 text-[11px]">
					<span className="min-w-0 truncate text-muted-foreground">
						Frozen instructions — no longer match{" "}
						{profileName ? `${profileName}'s` : "your"} current prompt.
					</span>
					<Button
						variant="link"
						size="auto"
						onClick={onNewChat}
						className="shrink-0 font-medium text-foreground"
					>
						New chat
					</Button>
				</div>
			)}
		</div>
	);
}
