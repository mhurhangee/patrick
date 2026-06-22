import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Bm25Index, buildBm25 } from "@/lib/search/bm25";
import { type Chunk, chunkPages } from "@/lib/search/chunk";
import { embedPassages, embedQuery } from "@/lib/search/embed";
import { hybridRank, type SearchHit } from "@/lib/search/search";

type Status = "loading" | "no-text" | "ready" | "error";
type Index = { chunks: Chunk[]; vectors: Float32Array[]; bm25: Bm25Index };

// Built indexes live for the app session, keyed by document, so reopening the panel
// (or switching back to a doc) never re-embeds — the slow part. `inflight` dedupes
// concurrent builds (e.g. StrictMode's double-mount). Phase 1 persists this to disk.
const indexCache = new Map<string, Index>();
const inflight = new Map<string, Promise<Index | null>>();

function buildIndex(
	key: string,
	loadPages: () => Promise<{ text: string }[] | null>,
	onProgress: (done: number, total: number) => void,
): Promise<Index | null> {
	const cached = indexCache.get(key);
	if (cached) return Promise.resolve(cached);
	const existing = inflight.get(key);
	if (existing) return existing;
	const build = (async () => {
		const pages = await loadPages();
		if (!pages || pages.every((p) => !p.text.trim())) return null;
		const chunks = chunkPages(pages);
		const vectors = await embedPassages(
			chunks.map((c) => c.text),
			onProgress,
		);
		const idx: Index = { chunks, vectors, bm25: buildBm25(chunks) };
		indexCache.set(key, idx);
		return idx;
	})().finally(() => inflight.delete(key));
	inflight.set(key, build);
	return build;
}

/**
 * Spike: in-document semantic search. Chunks the document's text, embeds every
 * chunk in the webview, and ranks passages by meaning against the query — so
 * "a car" surfaces "the vehicle", not just literal matches. Throwaway UI proving
 * the engine + model + speed; persistence, BM25/rerank, and the agent tool follow.
 */
export function DocSearchPanel({
	cacheKey,
	loadPages,
	onJump,
	onClose,
}: {
	cacheKey: string;
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
	const indexRef = useRef<Index | null>(null);

	// Get the index for this doc — instant on a cache hit (reopening), otherwise
	// built once. Only embedding (a cold build) shows the loading/indexing status.
	useEffect(() => {
		let cancelled = false;
		const cached = indexCache.get(cacheKey);
		if (cached) {
			indexRef.current = cached;
			setStatus("ready");
			return;
		}
		setStatus("loading");
		setProgress(null);
		buildIndex(cacheKey, loadPages, (done, total) => {
			if (!cancelled) setProgress({ done, total });
		})
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
		};
	}, [cacheKey, loadPages]);

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
		<div className="absolute inset-y-0 right-0 z-10 flex w-80 flex-col border-l bg-background shadow-lg">
			<div className="flex items-center gap-2 border-b px-3 py-2">
				<Search className="size-4 shrink-0 text-muted-foreground" />
				<Input
					autoFocus
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search this document…"
					disabled={status !== "ready"}
					className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
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
							: "Loading search model…"}
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
								<div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
									<span>p. {hit.page}</span>
									<span className="tabular-nums">
										{(hit.score * 100).toFixed(0)}%
									</span>
								</div>
								<p className="line-clamp-4 leading-snug text-foreground">
									{hit.text}
								</p>
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
