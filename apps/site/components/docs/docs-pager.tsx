import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

type Entry = { title: string; url: string };

export function DocsPager({ prev, next }: { prev?: Entry; next?: Entry }) {
	if (!prev && !next) return null;
	return (
		<nav className="mt-12 grid grid-cols-2 gap-4 border-t border-border pt-6">
			{prev ? (
				<Link
					href={prev.url}
					className="flex flex-col rounded-lg border border-border p-4 transition-colors hover:bg-accent"
				>
					<span className="flex items-center gap-1 text-xs text-muted-foreground">
						<ChevronLeft className="size-3.5" />
						Previous
					</span>
					<span className="mt-1 font-medium text-foreground">{prev.title}</span>
				</Link>
			) : (
				<span />
			)}
			{next ? (
				<Link
					href={next.url}
					className="flex flex-col items-end rounded-lg border border-border p-4 text-right transition-colors hover:bg-accent"
				>
					<span className="flex items-center gap-1 text-xs text-muted-foreground">
						Next
						<ChevronRight className="size-3.5" />
					</span>
					<span className="mt-1 font-medium text-foreground">{next.title}</span>
				</Link>
			) : (
				<span />
			)}
		</nav>
	);
}
