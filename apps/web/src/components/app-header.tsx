import { Link } from "@tanstack/react-router"
import { ArrowRight, BookText, GitBranch } from "lucide-react"
import { Logo } from "@/components/logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function AppHeader() {
	return (
		<header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-6 backdrop-blur-sm">
			<div className="flex items-center gap-2">
				<Link to="/" className="flex items-center gap-2">
					<Logo size={18} />
					<span className="font-heading font-semibold tracking-tight">PatrickOS</span>
				</Link>
				<Badge variant="secondary" className="text-xs">beta</Badge>
			</div>
			<nav className="flex items-center gap-2">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/docs">
						<BookText size={14} />
						Docs
					</Link>
				</Button>
				<Button variant="ghost" size="sm" asChild>
					<a href="https://github.com/mhurhangee/patrickos" target="_blank" rel="noopener noreferrer">
						<GitBranch size={14} />
						GitHub
					</a>
				</Button>
				<Button size="sm" asChild>
					<Link to="/workspace">
						Open workspace <ArrowRight size={14} />
					</Link>
				</Button>
			</nav>
		</header>
	)
}
