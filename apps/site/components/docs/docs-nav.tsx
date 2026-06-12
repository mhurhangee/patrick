"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavNode } from "@/lib/docs";
import { cn } from "@/lib/utils";

function containsActive(node: NavNode, pathname: string): boolean {
	return (
		node.url === pathname ||
		node.children.some((c) => containsActive(c, pathname))
	);
}

const pad = (depth: number) =>
	depth === 0 ? "pl-3" : depth === 1 ? "pl-6" : "pl-9";

// Folder-driven, collapsible nav. Sections auto-expand around the active page.
export function DocsNav({ nodes }: { nodes: NavNode[] }) {
	const pathname = usePathname();
	return (
		<nav className="space-y-1">
			{nodes.map((node) => (
				<NavItem
					key={node.url ?? node.title}
					node={node}
					pathname={pathname}
					depth={0}
				/>
			))}
		</nav>
	);
}

function NavItem({
	node,
	pathname,
	depth,
}: {
	node: NavNode;
	pathname: string;
	depth: number;
}) {
	const hasChildren = node.children.length > 0;
	const active = node.url === pathname;
	const shouldBeOpen = hasChildren && containsActive(node, pathname);
	const [open, setOpen] = useState(shouldBeOpen);

	// Auto-expand when navigation lands on this section or one of its pages
	// (without forcing it shut when the user has opened it manually).
	useEffect(() => {
		if (shouldBeOpen) setOpen(true);
	}, [shouldBeOpen]);

	if (!hasChildren) {
		return (
			<Link
				href={node.url ?? "#"}
				className={cn(
					"block rounded-md border-l-2 py-1.5 pr-2 text-sm transition-colors",
					pad(depth),
					active
						? "border-primary bg-accent font-medium text-foreground"
						: "border-transparent text-muted-foreground hover:text-foreground",
				)}
			>
				{node.title}
			</Link>
		);
	}

	return (
		<div>
			<div className={cn("flex items-center pr-1", pad(depth))}>
				{node.url ? (
					<Link
						href={node.url}
						className={cn(
							"flex-1 py-1.5 text-sm font-medium transition-colors",
							active
								? "text-primary"
								: "text-foreground/80 hover:text-foreground",
						)}
					>
						{node.title}
					</Link>
				) : (
					<button
						type="button"
						onClick={() => setOpen((o) => !o)}
						className="flex-1 py-1.5 text-left text-sm font-medium text-foreground/80"
					>
						{node.title}
					</button>
				)}
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-label={open ? "Collapse section" : "Expand section"}
					className="rounded p-1 text-muted-foreground/50 hover:text-foreground"
				>
					<ChevronRight
						className={cn("size-3.5 transition-transform", open && "rotate-90")}
					/>
				</button>
			</div>
			{open && (
				<div className="mt-0.5 space-y-1">
					{node.children.map((c) => (
						<NavItem
							key={c.url ?? c.title}
							node={c}
							pathname={pathname}
							depth={depth + 1}
						/>
					))}
				</div>
			)}
		</div>
	);
}
