"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

// Copies the page's raw Markdown — paste straight into Claude or ChatGPT.
export function CopyPage({ markdown }: { markdown: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				await navigator.clipboard.writeText(markdown);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
			className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
			{copied ? "Copied" : "Copy page"}
		</button>
	);
}
