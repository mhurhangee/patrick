import { ArrowUpRight, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { feedbackMailto, githubIssueUrl } from "@/lib/feedback";

// Feedback in two flavours: a public, trackable GitHub issue, or a private
// email. Both pre-filled with the app version + OS; nothing leaves the machine
// until the attorney hits submit/send themselves.
export function FeedbackButton() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon-sm" tooltip="Send feedback">
					<MessageSquare className="size-4 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-2">
				<div className="px-1 pb-2">
					<p className="text-sm font-medium">Send feedback</p>
					<p className="text-xs text-muted-foreground">
						Bugs, feature requests, rough edges, half-formed ideas — all
						genuinely welcome.
					</p>
				</div>
				<a
					href={githubIssueUrl()}
					target="_blank"
					rel="noreferrer"
					className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
				>
					<ArrowUpRight className="size-3.5 text-muted-foreground" />
					Report on GitHub
				</a>
				<a
					href={feedbackMailto()}
					className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
				>
					<Mail className="size-3.5 text-muted-foreground" />
					Email feedback
				</a>
			</PopoverContent>
		</Popover>
	);
}
