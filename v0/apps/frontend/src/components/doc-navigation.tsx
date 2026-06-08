import { Link, useRouterState } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { DOC_NAV } from "@/lib/doc-nav"

export function DocNavigation() {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const index = DOC_NAV.findIndex((n) => n.to === pathname)
	const prev = DOC_NAV[index - 1]
	const next = DOC_NAV[index + 1]

	if (!prev && !next) return null

	return (
		<div className="mt-12 flex items-center justify-between border-t pt-6">
			{prev ? (
				<Link to={prev.to} className="group flex flex-col gap-1">
					<span className="text-[10px] uppercase tracking-widest text-muted-foreground">
						Previous
					</span>
					<span className="flex items-center gap-1.5 text-sm font-medium group-hover:text-primary transition-colors">
						<ArrowLeft size={13} />
						{prev.label}
					</span>
				</Link>
			) : (
				<span />
			)}
			{next ? (
				<Link to={next.to} className="group flex flex-col items-end gap-1">
					<span className="text-[10px] uppercase tracking-widest text-muted-foreground">
						Next
					</span>
					<span className="flex items-center gap-1.5 text-sm font-medium group-hover:text-primary transition-colors">
						{next.label}
						<ArrowRight size={13} />
					</span>
				</Link>
			) : (
				<span />
			)}
		</div>
	)
}
