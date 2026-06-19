import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";
import { RotatingWord } from "@/components/rotating-word";
import { Shot } from "@/components/shot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
	return (
		<>
			<Hero />
			{FEATURES.map((feature) => (
				<Reveal key={feature.title}>
					<Feature {...feature} />
				</Reveal>
			))}
			<Reveal>
				<Pillars />
			</Reveal>
			<Reveal>
				<Closing />
			</Reveal>
		</>
	);
}

// One container, one rhythm. Every non-hero band is a Section: full width, a
// hairline top rule, the same generous padding.
function Section({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className="border-t border-border/60">
			<div className={cn("mx-auto max-w-5xl px-6 py-24 sm:py-32", className)}>
				{children}
			</div>
		</section>
	);
}

// Headline left, supporting copy + CTA right — the same two-column top row the
// feature blocks use, so the hero balances instead of hugging the left.
function Hero() {
	return (
		<section className="mx-auto max-w-5xl px-6 pt-20 pb-8 sm:pt-28">
			<span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
				<span className="size-1.5 rounded-full bg-[var(--patrick-coral)]" />
				Alpha — in active development
			</span>
			<div className="grid gap-x-16 gap-y-5 lg:grid-cols-[3fr_2fr]">
				<h1 className="text-5xl leading-[1.05] tracking-tight sm:text-6xl">
					Your{" "}
					<RotatingWord
						words={["Free", "Private", "Open", "Local"]}
						className="text-[var(--patrick-coral)]"
					/>
					<br />
					AI patent agent.
				</h1>
				<p className="text-lg leading-relaxed text-muted-foreground lg:pt-3">
					Reads, edits and reasons your Word files on{" "}
					<span className="text-red-400 line-through">the cloud</span>{" "}
					<span className="text-red-400 underline underline-offset-2">
						your own computer
					</span>{" "}
					— tracked changes you approve.
				</p>
			</div>

			<div className="mt-10 flex flex-col items-start gap-3">
				<div className="flex flex-wrap gap-3">
					<Button asChild className="h-12 rounded-lg px-7 text-sm">
						<Link href="/download">Download free for Windows</Link>
					</Button>
					<Button
						asChild
						variant="outline"
						className="h-12 rounded-lg px-7 text-sm"
					>
						<Link href="/download#waitlist">Join the waitlist</Link>
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					Bring your own AI key — you pay your provider, never us.
				</p>
			</div>

			<div className="mt-16">
				<Shot
					light="/hero-light.png"
					dark="/hero-dark.png"
					alt="The Patrick workspace — the editor with tracked changes and the chat panel"
					capture="The Patrick workspace, full window."
				/>
			</div>
		</section>
	);
}

const FEATURES = [
	{
		title: "It works inside your documents.",
		body: "Patrick edits your actual Word file as native tracked changes — accept or reject each one, just like a colleague's redlines. No copy-paste, no reformatting.",
		light: "/tracked-changes-light.png",
		dark: "/tracked-changes-dark.png",
	},
	{
		title: "You write the instructions.",
		body: "Patrick's whole system prompt is yours to read and edit — your practice, your style, your rules. Nothing it's told is hidden from you, and nothing is fixed.",
		light: "/system-prompt-light.png",
		dark: "/system-prompt-dark.png",
	},
	{
		title: "Nothing happens behind your back.",
		body: "See what the AI is told, the reasoning it follows, every step it takes, and what each turn costs. You stay in the loop and in control.",
		light: "/tool-use-light.png",
		dark: "/tool-use-dark.png",
	},
	{
		title: "Your choice of model.",
		body: "Use Anthropic, OpenAI, or Google — your key, your model, your account. Switch whenever you like, and pay your provider directly for what you use.",
		light: "/ai-choice-light.png",
		dark: "/ai-choice-dark.png",
	},
	{
		title: "Your files never leave your machine.",
		body: "Patrick works inside a folder you already have. Your documents and your AI key stay local — there is no Patrick server in the middle.",
		light: "/files-light.png",
		dark: "/files-dark.png",
	},
];

// Heading | Details across the top, the screenshot spanning full width below.
function Feature({
	title,
	body,
	light,
	dark,
}: {
	title: string;
	body: string;
	light: string;
	dark: string;
}) {
	return (
		<Section>
			<div className="grid gap-x-16 gap-y-4 lg:grid-cols-2">
				<h2 className="text-3xl tracking-tight sm:text-4xl">{title}</h2>
				<p className="text-lg leading-relaxed text-muted-foreground">{body}</p>
			</div>
			<div className="mt-12 sm:mt-16">
				<Shot light={light} dark={dark} alt={title} capture={title} />
			</div>
		</Section>
	);
}

function Pillars() {
	return (
		<Section>
			<div className="grid gap-x-16 gap-y-10 sm:grid-cols-3">
				<Pillar
					word="Open"
					line="Apache-2.0, plain .docx and .pdf, no lock-in."
				/>
				<Pillar
					word="Transparent"
					line="See the prompt, the reasoning, and the cost."
				/>
				<Pillar
					word="Yours"
					line="Your files and keys never leave your machine."
				/>
			</div>
		</Section>
	);
}

function Pillar({ word, line }: { word: string; line: string }) {
	return (
		<div>
			<h3 className="font-heading text-2xl font-semibold tracking-tight">
				{word}
			</h3>
			<p className="mt-2 text-muted-foreground">{line}</p>
		</div>
	);
}

// Centered — the other exception, mirroring the hero.
function Closing() {
	return (
		<Section className="text-center">
			<h2 className="text-4xl tracking-tight sm:text-5xl">
				Free, and free of strings.
			</h2>
			<p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
				No subscription, no per-seat fee, no upsell. Patrick is open-source and
				free to run — you bring your own AI provider key and pay them directly
				for what you use, usually pennies per response.
			</p>
			<div className="mt-10 flex flex-wrap justify-center gap-3">
				<Button asChild className="h-12 rounded-lg px-7 text-sm">
					<Link href="/download">Download free for Windows</Link>
				</Button>
				<Button
					asChild
					variant="outline"
					className="h-12 rounded-lg px-7 text-sm"
				>
					<Link href="/download#waitlist">Join the waitlist</Link>
				</Button>
			</div>
		</Section>
	);
}
