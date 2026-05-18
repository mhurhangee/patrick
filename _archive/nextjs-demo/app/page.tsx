import {
	ArrowRight,
	File,
	FilePen,
	GitBranch,
	Layers,
	Lock,
	ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"

const features = [
	{
		icon: Lock,
		title: "Local-first & ephemeral",
		body: "Nothing leaves your machine unless you choose it. Every document, claim, and disclosure lives in your browser — no accounts, no cloud storage, no exposure.",
	},
	{
		icon: FilePen,
		title: "Full patent drafting",
		body: "Draft utility, provisional, and design applications with structured claim editors, automatic dependency tracking, and export to USPTO-compliant formats.",
	},
	{
		icon: File,
		title: "Office action responses",
		body: "Import rejection notices, map prior art to specific claims, and draft responses with built-in 35 U.S.C. § guidance — without a billable hour in sight.",
	},
	{
		icon: Layers,
		title: "Inventor disclosure forms",
		body: "Capture invention disclosures in a structured, searchable format. Track inventors, filing dates, and embodiments from conception to grant.",
	},
	{
		icon: ShieldCheck,
		title: "Privilege-aware design",
		body: "Ephemeral by default — session data is never persisted to a server. Export only what you intend to. Designed with attorney-client privilege in mind.",
	},
	{
		icon: GitBranch,
		title: "Open source",
		body: "MIT licensed. Audit every line. Self-host on your own infrastructure. Contribute features your practice actually needs.",
	},
]

const steps = [
	{
		n: "01",
		title: "Open the app",
		body: "No sign-up. No installation. Open your browser and start drafting immediately.",
	},
	{
		n: "02",
		title: "Draft or respond",
		body: "Write claims, build the specification, or upload an office action to begin your response.",
	},
	{
		n: "03",
		title: "Export when ready",
		body: "Download a USPTO-ready PDF or DOCX. Nothing is stored — close the tab and it's gone.",
	},
]

export default function LandingPage() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			{/* Nav */}
			<header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
					<Link href="/" className="flex items-center gap-2.5">
						<Logo size={28} radius={6} />
						<span className="text-lg font-semibold tracking-tight">
							PatrickOS
						</span>
					</Link>
					<nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
						<Button asChild variant="ghost">
							<Link href="#features">Features</Link>
						</Button>
						<Button asChild variant="ghost">
							<Link href="#how-it-works">How it works</Link>
						</Button>
						<Button asChild variant="ghost">
							<Link href="https://github.com">GitHub</Link>
						</Button>
					</nav>
					<Button asChild variant="default">
						<Link href="/workspace">
							Open app
							<ArrowRight size={14} />
						</Link>
					</Button>
				</div>
			</header>

			{/* Hero */}
			<section className="mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-32">
				<div className="max-w-3xl">
					<div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-border bg-secondary px-3 py-1.5 text-sm font-medium uppercase tracking-widest text-muted-foreground">
						Free · Open source · Local-first
					</div>
					<h1 className="text-4xl font-medium leading-[1.15] tracking-tight md:text-5xl lg:text-[56px]">
						Patent drafting software
						<br />
						<span className="text-primary font-semibold text-pretty font-heading">
							that respects your work.
						</span>
					</h1>
					<p className="mt-6 max-w-xl leading-relaxed text-muted-foreground">
						Draft patent applications, write claim sets, and respond to USPTO
						office actions — entirely in your browser. No account. No billing.
						No data leaving your machine.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-3">
						<Button asChild variant="default" size="lg">
							<Link href="/app">
								Start drafting
								<ArrowRight size={16} />
							</Link>
						</Button>
						<Button asChild variant="outline" size="lg">
							<Link href="https://github.com">
								<GitBranch size={16} />
								View on GitHub
							</Link>
						</Button>
					</div>
				</div>
				<div className="mt-20 flex items-center gap-4">
					<div className="h-px flex-1 bg-border" />
					<Logo size={22} radius={5} />
					<div className="h-px flex-1 bg-border" />
				</div>
			</section>

			{/* Features */}
			<section id="features" className="bg-secondary py-24">
				<div className="mx-auto max-w-6xl px-6">
					<div className="mb-14">
						<div className="mb-3 h-[3px] w-8 rounded-sm bg-primary" />
						<h2 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
							Everything you need.
							<br />
							<span className="text-primary">Nothing you don't.</span>
						</h2>
					</div>
					<div className="grid gap-px border border-border rounded-lg overflow-hidden md:grid-cols-2 lg:grid-cols-3">
						{features.map((f) => (
							<div
								key={f.title}
								className="flex flex-col gap-3 bg-card p-7 transition-colors hover:bg-background"
							>
								<div className="flex items-center gap-2.5">
									<f.icon size={18} className="text-primary shrink-0" />
									<h3 className="font-heading text-base font-medium">
										{f.title}
									</h3>
								</div>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{f.body}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* How it works */}
			<section id="how-it-works" className="py-24">
				<div className="mx-auto max-w-6xl px-6">
					<div className="mb-14">
						<div className="mb-3 h-[3px] w-8 rounded-sm bg-primary" />
						<h2 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
							Up in three steps.
						</h2>
					</div>
					<div className="grid gap-8 md:grid-cols-3">
						{steps.map((s, i) => (
							<div key={s.n} className="flex flex-col gap-4">
								<div className="flex items-center gap-3">
									<span className="font-mono tabular-nums text-muted-foreground">
										{s.n}
									</span>
									{i < steps.length - 1 && (
										<div className="h-px flex-1 border-t border-dashed border-border" />
									)}
								</div>
								<h3 className="font-heading text-base font-medium">
									{s.title}
								</h3>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{s.body}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="border-t border-border bg-primary py-16 text-primary-foreground">
				<div className="mx-auto max-w-6xl px-6">
					<div className="flex flex-col gap-10 md:flex-row md:items-center md:gap-16">
						<Logo
							size={80}
							bg="rgba(255,255,255,0.12)"
							stroke="white"
							radius={18}
							className="shrink-0"
						/>

						<div className="flex flex-1 flex-col gap-8 md:flex-row md:items-center md:justify-between">
							<h2 className="font-heading text-2xl font-medium leading-snug md:text-3xl">
								Your inventions.
								<br />
								Your machine.
								<br />
								Your terms.
							</h2>

							<div className="flex shrink-0 flex-col gap-3 sm:flex-row">
								<Button asChild variant="secondary">
									<Link href="/app">
										Open the app
										<ArrowRight size={16} />
									</Link>
								</Button>
								<Button asChild variant="ghost">
									<Link href="https://github.com">
										<GitBranch size={16} />
										Star on GitHub
									</Link>
								</Button>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="border-t border-border py-8">
				<div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
					<div className="flex items-center gap-2">
						<Logo size={18} radius={4} />
						<span className="font-semibold tracking-tight text-foreground">
							PatrickOS
						</span>
						<span className="text-muted-foreground tracking-normal">
							— MIT License
						</span>
					</div>
					<p>Open source. Free. Local-first.</p>
				</div>
			</footer>
		</div>
	)
}
