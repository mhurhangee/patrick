"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// v1.0 waitlist — posts the email straight to Formspree (no backend of our own,
// in keeping with "no servers"). Dependency-free: a plain fetch to the endpoint.
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xnjyeqjb";

type State = "idle" | "submitting" | "done" | "error";

export function WaitlistForm() {
	const [email, setEmail] = useState("");
	const [state, setState] = useState<State>("idle");

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (state === "submitting") return;
		setState("submitting");
		try {
			const res = await fetch(FORMSPREE_ENDPOINT, {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email }),
			});
			setState(res.ok ? "done" : "error");
		} catch {
			setState("error");
		}
	}

	if (state === "done")
		return (
			<p className="text-sm text-muted-foreground">
				Thanks — we'll email you when v1.0 ships.
			</p>
		);

	return (
		<div className="w-full max-w-md">
			<form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
				{/* Honeypot — bots fill it, humans never see it. */}
				<input
					type="text"
					name="_gotcha"
					tabIndex={-1}
					autoComplete="off"
					aria-hidden="true"
					className="hidden"
				/>
				<input
					type="email"
					name="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="you@firm.com"
					className="h-12 flex-1 rounded-lg border border-border bg-background px-4 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
				/>
				<Button
					type="submit"
					disabled={state === "submitting"}
					className="h-12 rounded-lg px-7 text-sm"
				>
					{state === "submitting" ? "Joining…" : "Notify me at v1.0"}
				</Button>
			</form>
			{state === "error" && (
				<p className="mt-2 text-sm text-destructive">
					Something went wrong — try again, or email us.
				</p>
			)}
		</div>
	);
}
