import { Loader2, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	type DocIndex,
	getDocIndex,
	indexKey,
	onIndexProgress,
} from "@/lib/search/doc-index";
import { embedQuery } from "@/lib/search/embed";
import { hybridRank, type SearchHit } from "@/lib/search/search";

type Status = "loading" | "no-text" | "ready" | "error";

const SNIPPET_LEN = 260;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Show a short window around the first keyword match (not the whole chunk, which is
// a wall of text), with the query terms highlighted so the relevant bit stands out.
function highlightSnippet(text: string, query: string): ReactNode[] {
	const terms = query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 1);

	let start = 0;
	if (terms.length) {
		const lower = text.toLowerCase();
		let first = -1;
		for (const t of terms) {
			const i = lower.indexOf(t);
			if (i >= 0 && (first < 0 || i < first)) first = i;
		}
		if (first > 60) start = first - 40;
	}
	const slice = text.slice(start, start + SNIPPET_LEN);
	const body =
		(start > 0 ? "…" : "") +
		slice +
		(start + SNIPPET_LEN < text.length ? "…" : "");

	if (!terms.length) return [body];
	const re = new RegExp(`(${terms.map(escapeRe).join("|")})`, "gi");
	let offset = 0;
	return body
		.split(re)
		.filter(Boolean)
		.map((p) => {
			const key = offset;
			offset += p.length;
			return terms.includes(p.toLowerCase()) ? (
				<mark
					key={key}
					className="rounded bg-amber-200/70 text-foreground dark:bg-amber-300/30"
				>
					{p}
				</mark>
			) : (
				<span key={key}>{p}</span>
			);
		});
}

/**
 * In-document hybrid search. Chunks the document's text, embeds every chunk in the
 * webview, and ranks passages by meaning + keyword against the query — so "a car"
 * surfaces "the vehicle", not just literal matches. The index is built once and
 * persisted (see getDocIndex); this panel is the search surface ahead of the agent tool.
 */
export function DocSearchPanel({
	taskId,
	filename,
	loadPages,
	onJump,
	onClose,
}: {
	taskId: string;
	filename: string;
	loadPages: () => Promise<{ text: string }[] | null>;
	onJump?: (page: number) => void;
	onClose: () => void;
}) {
	const [status, setStatus] = useState<Status>("loading");
	const [progress, setProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchHit[]>([]);
	const [searching, setSearching] = useState(false);
	const indexRef = useRef<DocIndex | null>(null);

	// Resolve the index for this doc — cache/disk hits are instant; only a cold build
	// (embedding) shows the loading/indexing status, via the progress subscription.
	useEffect(() => {
		let cancelled = false;
		setStatus("loading");
		setProgress(null);
		const unsubscribe = onIndexProgress(
			indexKey(taskId, filename),
			(done, total) => {
				if (!cancelled) setProgress({ done, total });
			},
		);
		getDocIndex(taskId, filename, loadPages)
			.then((idx) => {
				if (cancelled) return;
				if (!idx) {
					setStatus("no-text");
					return;
				}
				indexRef.current = idx;
				setStatus("ready");
			})
			.catch((err) => {
				console.error("[search] index failed", err);
				if (!cancelled) setStatus("error");
			});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [taskId, filename, loadPages]);

	// Debounced semantic search over the built index.
	useEffect(() => {
		const idx = indexRef.current;
		const q = query.trim();
		if (status !== "ready" || !idx || !q) {
			setResults([]);
			return;
		}
		let cancelled = false;
		setSearching(true);
		const timer = setTimeout(async () => {
			try {
				const qv = await embedQuery(q);
				if (!cancelled)
					setResults(hybridRank(qv, q, idx.chunks, idx.vectors, idx.bm25, 15));
			} finally {
				if (!cancelled) setSearching(false);
			}
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [query, status]);

	return (
		<div className="flex h-full w-full flex-col bg-background">
			<div className="flex items-center gap-2 border-b px-3 py-2">
				<Search className="size-4 shrink-0 text-muted-foreground" />
				<Input
					autoFocus
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search this document…"
					disabled={status !== "ready"}
					className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
				/>
				<Button
					variant="ghost"
					size="icon-sm"
					tooltip="Close search"
					onClick={onClose}
				>
					<X />
				</Button>
			</div>

			<div className="min-h-0 flex-1 overflow-auto p-2">
				{status === "loading" && (
					<div className="flex items-center gap-2 p-3 text-muted-foreground text-xs">
						<Loader2 className="size-3.5 animate-spin" />
						{progress
							? `Indexing… ${progress.done}/${progress.total}`
							: "Preparing…"}
					</div>
				)}
				{status === "no-text" && (
					<p className="p-3 text-muted-foreground text-xs">
						No extracted text yet — extract this document's text to enable
						search.
					</p>
				)}
				{status === "error" && (
					<p className="p-3 text-muted-foreground text-xs">
						Couldn't build the search index.
					</p>
				)}
				{status === "ready" && !query.trim() && (
					<p className="p-3 text-muted-foreground text-xs">
						Search by meaning — synonyms and paraphrases match, not just exact
						words.
					</p>
				)}
				{status === "ready" &&
					query.trim() &&
					!searching &&
					results.length === 0 && (
						<p className="p-3 text-muted-foreground text-xs">No matches.</p>
					)}
				<ul className="space-y-1">
					{results.map((hit) => (
						<li key={hit.index}>
							<button
								type="button"
								onClick={() => onJump?.(hit.page)}
								className="w-full rounded-md px-2 py-2 text-left text-xs hover:bg-muted"
							>
								{onJump && (
									<div className="mb-1 text-[10px] text-muted-foreground">
										p. {hit.page}
									</div>
								)}
								<p className="line-clamp-3 leading-snug text-foreground">
									{highlightSnippet(hit.text, query)}
								</p>
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
