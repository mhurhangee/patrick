import { MessageSquare } from "lucide-react";
import { mockChats } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Section } from "./section";

// Chats are still mocked — no chat persistence yet.
export function ChatsNav() {
	return (
		<Section label="Chats">
			{mockChats.map((c) => (
				<div
					key={c.id}
					className={cn(
						"group flex items-start gap-2 rounded-none border-l-2 py-1.5 pr-1 pl-2 transition-colors hover:bg-sidebar-accent",
						c.active
							? "border-primary bg-sidebar-accent/50"
							: "border-transparent",
					)}
				>
					<MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<span className="min-w-0 flex-1">
						<span className="block truncate text-sm">{c.title}</span>
						<span className="block truncate text-xs text-muted-foreground">
							{c.preview}
						</span>
					</span>
				</div>
			))}
		</Section>
	);
}
