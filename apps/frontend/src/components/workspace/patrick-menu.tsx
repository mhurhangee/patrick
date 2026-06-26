import { CHANGELOG_URL, DOCS_URL, LATEST_HIGHLIGHTS } from "@patrick/shared";
import { Badge } from "@patrick/ui/components/badge";
import { Button } from "@patrick/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@patrick/ui/components/dropdown-menu";
import { ArrowUpRight } from "lucide-react";
import { feedbackMailto, githubIssueUrl } from "@/lib/feedback";
import { Patrick } from "../patrick";

// An external-link menu row: label on the left, a ↗ on the right.
function LinkItem({ href, children }: { href: string; children: string }) {
	return (
		<DropdownMenuItem asChild>
			<a href={href} target="_blank" rel="noreferrer">
				{children}
				<ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" />
			</a>
		</DropdownMenuItem>
	);
}

// The Patrick chip in the chat header is the app's about/help menu: the version
// (with a one-line "what's new"), docs + changelog, and feedback — kept easy to
// reach since it's an alpha. The whole mark + wordmark + version is the trigger.
export function PatrickMenu() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="h-auto min-w-0 gap-2 px-2 py-1 text-foreground"
				>
					<Patrick size={18} />
					<span className="hidden font-heading text-lg font-semibold tracking-tighter @[20rem]:inline">
						Patrick
					</span>
					<Badge
						variant="outline"
						className="hidden px-1.5 text-[10px] text-muted-foreground @[20rem]:inline"
					>
						v{__APP_VERSION__}
					</Badge>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-60">
				<DropdownMenuLabel className="font-normal">
					<span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
						v{__APP_VERSION__}
					</span>
					<span className="mt-0.5 block text-sm">
						{LATEST_HIGHLIGHTS.headline}
					</span>
				</DropdownMenuLabel>
				<LinkItem href={CHANGELOG_URL}>Changelog</LinkItem>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="font-normal leading-snug">
					It's an alpha — your feedback genuinely shapes Patrick.
				</DropdownMenuLabel>
				<LinkItem href={githubIssueUrl()}>Report on GitHub</LinkItem>
				<LinkItem href={feedbackMailto()}>Email feedback</LinkItem>
				<DropdownMenuSeparator />
				<LinkItem href={DOCS_URL}>Documentation</LinkItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
