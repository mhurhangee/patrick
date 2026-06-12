import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "Privacy",
	description:
		"Patrick runs entirely on your own computer. Your documents and AI keys never leave your machine.",
};

export default function Privacy() {
	return (
		<div className="mx-auto max-w-2xl px-6 py-24">
			<h1 className="text-3xl sm:text-4xl">Privacy</h1>
			<div className="mt-6 space-y-4 text-lg leading-relaxed text-muted-foreground">
				<p>
					Patrick runs entirely on your own computer. Your documents stay in
					your own folders — we operate no servers, and never receive, store, or
					see your files.
				</p>
				<p>
					You bring your own AI provider key (Anthropic, OpenAI, or Google).
					When you ask Patrick to do something, the relevant text is sent
					directly from your machine to that provider, under your account and
					their terms — and nowhere else.
				</p>
				<p>
					That's the whole model: your work goes to the AI provider you chose,
					and to no one else. A full written policy will land with the alpha.
				</p>
			</div>
			<Button asChild className="mt-8 h-11 rounded-lg px-6 text-sm">
				<Link href="/">Back home</Link>
			</Button>
		</div>
	);
}
