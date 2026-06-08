import { FileText, SendHorizontal, Sparkles, SquarePen } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AgentChat() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-b px-4 py-2.5">
				<Sparkles className="size-4 text-primary" />
				<span className="text-sm font-medium">AgentPat</span>
				<span className="ml-auto text-xs text-muted-foreground">
					Claude Sonnet 4.5
				</span>
			</div>

			<div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
				<UserMsg>
					Amend claim 1 to distinguish over Smith — add that the frame includes
					a latch.
				</UserMsg>
				<AgentMsg>
					I'll read the office action and specification, locate claim 1, then
					propose the amendment as tracked changes.
				</AgentMsg>
				<ToolCard
					icon={<FileText />}
					name="read_document"
					detail="Read specification.pdf — located claim 1 (¶ [0014])."
				/>
				<ToolCard
					icon={<SquarePen />}
					name="suggest_change"
					detail="Amended claim 1: “…wherein the frame includes a latch.”"
					tracked
				/>
				<AgentMsg>
					Done. I amended claim 1 to recite the latch and added a § 103 argument
					that Smith fails to teach it. Review the 3 tracked changes in the
					document — accept or reject each.
				</AgentMsg>
			</div>

			<div className="border-t p-3">
				<div className="relative">
					<Textarea
						placeholder="Ask AgentPat to draft or amend…"
						className="max-h-48 min-h-20 resize-none pr-12"
					/>
					<Button
						size="icon"
						className="absolute right-2 bottom-2 size-8"
						title="Send"
					>
						<SendHorizontal />
					</Button>
				</div>
			</div>
		</div>
	);
}

function UserMsg({ children }: { children: ReactNode }) {
	return (
		<div className="flex justify-end">
			<div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary/10 px-3 py-2 text-sm">
				{children}
			</div>
		</div>
	);
}

function AgentMsg({ children }: { children: ReactNode }) {
	return <div className="text-sm leading-relaxed">{children}</div>;
}

function ToolCard({
	icon,
	name,
	detail,
	tracked,
}: {
	icon: ReactNode;
	name: string;
	detail: string;
	tracked?: boolean;
}) {
	return (
		<div className="rounded-md border bg-card px-3 py-2">
			<div className="flex items-center gap-2">
				<span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
				<span className="font-mono text-xs">{name}</span>
				{tracked && (
					<Badge variant="secondary" className="ml-auto text-xs">
						tracked change
					</Badge>
				)}
			</div>
			<p className="mt-1 text-xs text-muted-foreground">{detail}</p>
		</div>
	);
}
