import { Link } from "@tanstack/react-router";
import { FeedbackButton } from "@/components/shell/sidebar/feedback-button";
import { Button } from "@/components/ui/button";
import {
	type KeyStatus,
	keyStatusOf,
	useKeyVerification,
} from "@/hooks/use-key-verification";
import { useProfile } from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import { initialsOf } from "@/lib/text";
import { cn } from "@/lib/utils";

const DOT_COLOR: Record<KeyStatus, string> = {
	valid: "bg-emerald-500",
	invalid: "bg-amber-500",
	verifying: "bg-muted-foreground/40 animate-pulse",
	idle: "bg-muted-foreground/40",
};

export function SidebarFooter() {
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);

	const name = profile?.identity.name || "No profile";
	const firm = profile?.identity.firm || "";

	const hasKey = !!profile?.ai.apiKey;
	const verification = useKeyVerification(
		profile?.ai.provider,
		profile?.ai.apiKey,
		{ enabled: hasKey },
	);
	const status = keyStatusOf(verification);
	const dotTitle = !hasKey
		? "No API key set"
		: status === "valid"
			? "AI key verified"
			: status === "verifying"
				? "Verifying API key…"
				: "API key not verified — check in profile";

	return (
		<div className="flex items-center gap-1 p-2">
			<Button
				asChild
				variant="ghost"
				className="h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-1.5"
			>
				<Link to="/profile">
					<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
						{initialsOf(name)}
					</span>
					<span className="min-w-0 flex-1 text-left">
						<span className="block truncate text-sm">{name}</span>
						{firm && (
							<span className="block truncate text-xs text-muted-foreground">
								{firm}
							</span>
						)}
					</span>
				</Link>
			</Button>
			<FeedbackButton />
			<Button asChild variant="ghost" size="icon" title={dotTitle}>
				<Link to="/profile" search={{ tab: "ai" }}>
					<span className={cn("size-2.5 rounded-full", DOT_COLOR[status])} />
				</Link>
			</Button>
		</div>
	);
}
