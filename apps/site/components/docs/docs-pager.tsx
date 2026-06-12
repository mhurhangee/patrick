import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

type Entry = { title: string; url: string };

// Plain text-style links (not boxed) so they read as navigation, distinct from
// the boxed "next steps" cards a page might use in its content.
export function DocsPager({ prev, next }: { prev?: Entry; next?: Entry }) {
	if (!prev && !next) return null;
	return (
		<nav className="mt-12 flex items-start justify-between gap-4 border-t border-border pt-6">
			{prev ? (
				<Link
					href={prev.url}
					className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft className="size-4 shrink-0" />
					<span>
						<span className="block text-xs text-muted-foreground/60">
							Previous
						</span>
						<span className="font-medium">{prev.title}</span>
					</span>
				</Link>
			) : (
				<span />
			)}
			{next ? (
				<Link
					href={next.url}
					className="inline-flex items-center gap-2 text-right text-muted-foreground transition-colors hover:text-foreground"
				>
					<span>
						<span className="block text-xs text-muted-foreground/60">Next</span>
						<span className="font-medium">{next.title}</span>
					</span>
					<ChevronRight className="size-4 shrink-0" />
				</Link>
			) : (
				<span />
			)}
		</nav>
	);
}
