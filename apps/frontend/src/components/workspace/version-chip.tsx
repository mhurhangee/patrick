import { CHANGELOG_URL, LATEST_HIGHLIGHTS } from "@patrick/shared";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

// The version chip in the chat header: the running version, and on click a short
// "what's new" — the headline features for this release. The full, honest
// changelog (every fix and chore) is one link away rather than in your face.
export function VersionChip() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Badge
					variant="outline"
					className="text-[10px] px-1.5 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
				>
					v{__APP_VERSION__}
				</Badge>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-fit max-w-80">
				<div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
					What's new · v{__APP_VERSION__}
				</div>
				<p className="mt-1.5 font-heading text-sm font-semibold">
					{LATEST_HIGHLIGHTS.headline}
				</p>
				<ul
					className="mt-2 space-y-1.5 text-sm list-disc list-inside"
					style={{ color: "var(--patrick-green)" }}
				>
					{LATEST_HIGHLIGHTS.highlights.map((h) => (
						<li key={h}>
							<span className="text-foreground">{h}</span>
						</li>
					))}
				</ul>
				<a
					href={CHANGELOG_URL}
					target="_blank"
					rel="noreferrer"
					className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					Full changelog
					<ArrowUpRight className="size-3" />
				</a>
			</PopoverContent>
		</Popover>
	);
}
