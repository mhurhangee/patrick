import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL, ISSUES_URL } from "@/lib/links";

export const Route = createFileRoute("/contact")({ component: Contact });

function Contact() {
	return (
		<div className="mx-auto max-w-2xl px-6 py-24">
			<h1 className="text-3xl sm:text-4xl">Contact</h1>
			<div className="mt-6 space-y-4 text-lg leading-relaxed text-muted-foreground">
				<p>
					Patrick is early and built in the open. Bugs, feature requests, rough
					edges, half-formed ideas — all genuinely welcome, and all of it shapes
					where Patrick goes next.
				</p>
				<p>
					The best place is a{" "}
					<a
						href={ISSUES_URL}
						target="_blank"
						rel="noreferrer"
						className="text-foreground underline underline-offset-4 hover:text-foreground/80"
					>
						GitHub issue
					</a>{" "}
					— public and trackable, so others can find it and add their voice.
					Prefer something private? Email works too.
				</p>
			</div>
			<div className="mt-8 flex flex-wrap gap-3">
				<Button asChild className="h-11 rounded-lg px-6 text-sm">
					<a href={ISSUES_URL} target="_blank" rel="noreferrer">
						Open a GitHub issue
					</a>
				</Button>
				<Button
					asChild
					variant="outline"
					className="h-11 rounded-lg px-6 text-sm"
				>
					<a href={`mailto:${CONTACT_EMAIL}`}>Email us</a>
				</Button>
			</div>
		</div>
	);
}
