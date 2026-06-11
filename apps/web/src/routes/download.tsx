import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import { DOWNLOAD_URL, GITHUB_URL } from "@/lib/links";

export const Route = createFileRoute("/download")({ component: DownloadPage });

function DownloadPage() {
	return (
		<div className="mx-auto max-w-2xl px-6 py-20 sm:py-28">
			<div className="flex flex-col items-center gap-6 text-center">
				<Patrick size={56} />
				<h1 className="text-3xl sm:text-4xl">Download Patrick</h1>
				<p className="text-muted-foreground">
					The alpha is a Windows desktop app. You bring your own AI provider key
					(Anthropic, OpenAI, or Google) — it talks only to that provider.
				</p>
				<Button asChild className="h-11 rounded-lg px-6 text-sm">
					<a href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
						<Download className="size-5" />
						Download for Windows
					</a>
				</Button>
				<p className="text-xs text-muted-foreground">
					Latest release · Windows 10/11 · 64-bit
				</p>
			</div>

			<div className="mt-14 space-y-6 text-sm text-muted-foreground">
				<div>
					<h2 className="text-base text-foreground">Heads up — it's alpha</h2>
					<p className="mt-1 leading-relaxed">
						Expect rough edges. Patrick proposes changes as tracked edits and
						you review everything — but it's early, so keep backups of important
						documents. Found a bug or have a thought? It's open source —{" "}
						<a
							href={`${GITHUB_URL}/issues`}
							target="_blank"
							rel="noreferrer"
							className="font-medium text-foreground underline underline-offset-2"
						>
							open an issue
						</a>
						.
					</p>
				</div>
				<div>
					<h2 className="text-base text-foreground">Unsigned installer</h2>
					<p className="mt-1 leading-relaxed">
						The alpha isn't code-signed yet, so Windows SmartScreen may warn you
						with "Windows protected your PC". Click <em>More info</em> →{" "}
						<em>Run anyway</em> to install. Code signing comes with the beta.
					</p>
				</div>
			</div>
		</div>
	);
}
