"use client";

import { Check, ChevronDown, Copy, FileText, SquarePen } from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Split button (à la Linear): "Copy page" exposed, with the rest behind a
// chevron — copy / view raw markdown / edit on GitHub.
export function DocActions({
	markdown,
	rawHref,
	editHref,
}: {
	markdown: string;
	rawHref: string;
	editHref: string;
}) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		await navigator.clipboard.writeText(markdown);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="inline-flex shrink-0 items-center rounded-md border border-border text-xs">
			<button
				type="button"
				onClick={copy}
				className="inline-flex items-center gap-1.5 rounded-l-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				{copied ? (
					<Check className="size-3.5" />
				) : (
					<Copy className="size-3.5" />
				)}
				{copied ? "Copied" : "Copy page"}
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger className="rounded-r-md border-l border-border px-1.5 py-[0.4375rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground">
					<ChevronDown className="size-3.5" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onSelect={() => copy()}>
						<Copy /> Copy page
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<a href={rawHref} target="_blank" rel="noreferrer">
							<FileText /> View as markdown
						</a>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<a href={editHref} target="_blank" rel="noreferrer">
							<SquarePen /> Edit on GitHub
						</a>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
