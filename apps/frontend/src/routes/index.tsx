import { createFileRoute, Link } from "@tanstack/react-router"
import { BookOpen, Lock, Puzzle } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export const Route = createFileRoute("/")({
	component: LandingPage,
})

const FEATURES = [
	{
		icon: Lock,
		title: "Local-first",
		description:
			"Your documents never leave your machine unless you choose. Run entirely offline with Ollama, or connect to cloud AI when you need it.",
	},
	{
		icon: Puzzle,
		title: "Flexible deployment",
		description:
			"Run as a desktop app, self-host on your firm's infrastructure, or use our cloud. Same software, different configurations.",
	},
	{
		icon: BookOpen,
		title: "Open source",
		description:
			"MIT licensed. Audit the code, adapt the docs, host it yourself. No lock-in, no black boxes.",
	},
]

function LandingPage() {
	return (
		<div className="flex min-h-svh flex-col">
			<AppHeader />

			{/* Hero */}
			<main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
				<div className="flex flex-col items-center gap-4 max-w-2xl">
					<Logo size={48} />
					<h1 className="font-heading text-4xl font-semibold tracking-tight">
						Patent drafting on your terms
					</h1>
					<p className="text-muted-foreground text-lg max-w-lg">
						An open-source AI assistant for patent attorneys. Works offline,
						runs on your infrastructure, stays under your control.
					</p>
					<div className="flex items-center gap-3 mt-2">
						<Button size="lg" asChild>
							<Link to="/workspace">Open workspace</Link>
						</Button>
						<Button size="lg" variant="outline" asChild>
							<Link to="/docs">Read the docs</Link>
						</Button>
					</div>
				</div>
			</main>

			{/* Features */}
			<section className="px-6 py-12">
				<Separator className="mb-12" />
				<div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
					{FEATURES.map(({ icon: Icon, title, description }) => (
						<div key={title} className="flex flex-col gap-2">
							<div className="flex items-center gap-2 text-primary">
								<Icon size={15} />
								<span className="font-heading font-semibold text-sm text-foreground">
									{title}
								</span>
							</div>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{description}
							</p>
						</div>
					))}
				</div>
			</section>

			{/* Footer */}
			<footer className="border-t px-6 py-5">
				<div className="mx-auto flex max-w-4xl items-center justify-between">
					<div className="flex items-center gap-2">
						<Logo size={14} />
						<span className="text-xs font-medium">PatrickOS</span>
						<span className="text-xs text-muted-foreground">— MIT licence</span>
					</div>
					<nav className="flex items-center gap-4">
						<Link
							to="/docs"
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Docs
						</Link>
						<Link
							to="/workspace"
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Workspace
						</Link>
						<a
							href="https://github.com/mhurhangee/patrickos"
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							GitHub
						</a>
					</nav>
				</div>
			</footer>
		</div>
	)
}
