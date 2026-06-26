import { docKind } from "@patrick/shared";
import { Button } from "@patrick/ui/components/button";
import { Input } from "@patrick/ui/components/input";
import {
	ChevronDown,
	ChevronUp,
	Loader2,
	ScanText,
	Search,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useExtractText, useTaskDocuments } from "@/hooks/use-tasks";
import {
	type DocIndex,
	getDocIndex,
	indexKey,
	onIndexProgress,
} from "@/lib/search/doc-index";
import { useDocSearchHighlights } from "@/lib/search/doc-search-context";
import { embedQuery } from "@/lib/search/embed";
import { findOccurrences, type Occurrence } from "@/lib/search/exact";
import { hybridRank, type SearchHit } from "@/lib/search/search";
import { cn } from "@/lib/utils";
import { Patrick } from "../patrick";

type Status = "loading" | "no-text" | "ready" | "error";
type Mode = "semantic" | "exact";
type SortBy = "relevance" | "appearance";

const SNIPPET_LEN = 260;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Common words to never highlight: in a multi-word query they'd light up "the", "to",
// "of" … everywhere, turning the snippet into confetti and burying the distinctive terms.
const STOPWORDS = new Set([
	"the",
	"a",
	"an",
	"and",
	"or",
	"of",
	"to",
	"in",
	"on",
	"at",
	"by",
	"for",
	"with",
	"as",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"it",
	"its",
	"this",
	"that",
	"these",
	"those",
	"from",
	"into",
	"which",
	"such",
	"said",
	"comprising",
	"comprises",
	"wherein",
	"thereof",
	"having",
	"has",
	"have",
]);

// Show a short window around the first distinctive match (not the whole chunk, which is
// a wall of text), with the distinctive query terms highlighted so the relevant bit stands
// out — stopwords are excluded so they don't highlight everywhere.
function highlightSnippet(text: string, query: string): ReactNode[] {
	const all = query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 1);
	// Highlight the distinctive terms; but if the query is ALL stopwords (common in claim
	// language — "comprising the said"), fall back to all terms so something still highlights.
	const distinctive = all.filter((t) => !STOPWORDS.has(t));
	const terms = distinctive.length ? distinctive : all;

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
 * In-document search with two modes: Semantic (hybrid meaning + keyword over the
 * index) and Exact (literal occurrence scan — true Ctrl+F). Semantic results sort by
 * relevance or document order; Exact lists every occurrence with prev/next; both
 * highlight in the document. A PDF with no extracted text shows an extract prompt.
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
	const [mode, setMode] = useState<Mode>("semantic");
	const [sort, setSort] = useState<SortBy>("relevance");
	const [results, setResults] = useState<SearchHit[]>([]);
	const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
	const [selected, setSelected] = useState(0);
	const [searching, setSearching] = useState(false);
	const indexRef = useRef<DocIndex | null>(null);
	const pagesRef = useRef<{ text: string }[] | null>(null);
	const [pagesReady, setPagesReady] = useState(false);
	const [truncated, setTruncated] = useState(false);

	// A PDF with no extracted text can't be searched — offer to extract it (the same
	// on-device extraction/OCR as the sidebar kebab) instead of a dead "no results".
	const { data: documents } = useTaskDocuments(taskId);
	const extracted =
		documents?.find((d) => d.filename === filename)?.extracted ?? false;
	const needsExtraction =
		!!documents && docKind(filename) === "pdf" && !extracted;
	const extract = useExtractText(taskId);
	const [extractProgress, setExtractProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);
	const onExtract = () => {
		extract.mutate(
			{
				filename,
				onProgress: (done, total) => setExtractProgress({ done, total }),
			},
			{ onSettled: () => setExtractProgress(null) },
		);
	};

	// Resolve the index for this doc (Semantic mode) — cache/disk hits are instant; only a
	// cold build (embedding) shows the loading/indexing status, via the subscription.
	useEffect(() => {
		if (needsExtraction) return;
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
	}, [taskId, filename, loadPages, needsExtraction]);

	// Raw page text for Exact mode — loaded lazily the first time Exact is used (no
	// model needed; the index isn't required).
	useEffect(() => {
		if (mode !== "exact" || pagesRef.current) return;
		let cancelled = false;
		loadPages().then((pages) => {
			if (cancelled) return;
			pagesRef.current = pages ?? [];
			setPagesReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, [mode, loadPages]);

	// Smart: debounced hybrid search over the built index.
	useEffect(() => {
		if (mode !== "semantic") return;
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
				if (!cancelled) {
					setResults(hybridRank(qv, q, idx.chunks, idx.vectors, idx.bm25, 15));
					setSelected(0);
				}
			} finally {
				if (!cancelled) setSearching(false);
			}
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [query, status, mode]);

	// Exact: literal occurrence scan (no model), debounced — a single character on a
	// long doc matches thousands, so we debounce and cap. Gated on pagesReady.
	useEffect(() => {
		if (mode !== "exact" || !pagesReady) return;
		const q = query.trim();
		if (!q) {
			setOccurrences([]);
			setTruncated(false);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(() => {
			if (cancelled) return;
			const found = findOccurrences(pagesRef.current ?? [], q, 200);
			setOccurrences(found.items);
			setTruncated(found.truncated);
			setSelected(0);
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [query, mode, pagesReady]);

	// Reset the active selection the instant the query/mode changes, so the counter and
	// prev/next never index a stale (longer) list during the debounce window.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on query/mode change
	useEffect(() => {
		setSelected(0);
	}, [query, mode]);

	const sortedResults = useMemo(
		() =>
			sort === "appearance"
				? [...results].sort((a, b) => a.index - b.index)
				: results,
		[results, sort],
	);

	// The list the prev/next + selection act on, for whichever mode is active.
	const activeList: { page: number }[] =
		mode === "semantic" ? sortedResults : occurrences;
	const go = (delta: number) => {
		if (!activeList.length) return;
		const n = (selected + delta + activeList.length) % activeList.length;
		setSelected(n);
		onJump?.(activeList[n]?.page ?? 1);
	};

	// Push the current matches + selection to the viewer to highlight in the document.
	// Scroll only when the change wasn't a query edit (i.e. on navigation/sort), so the
	// doc doesn't jump on every keystroke.
	const { setHighlights } = useDocSearchHighlights();
	const prevQuery = useRef(query);
	useEffect(() => {
		const queryChanged = prevQuery.current !== query;
		prevQuery.current = query;
		if (mode === "semantic") {
			const sel = sortedResults[selected];
			setHighlights(
				sortedResults.map((r) => r.text),
				sel ? { text: sel.text, nth: 0 } : null,
				!queryChanged,
			);
		} else {
			const q = query.trim();
			setHighlights(
				q ? [q] : [],
				occurrences[selected] ? { text: q, nth: selected } : null,
				!queryChanged,
			);
		}
	}, [mode, sortedResults, occurrences, selected, query, setHighlights]);

	// Clear highlights when the panel closes (unmounts).
	useEffect(() => () => setHighlights([], null), [setHighlights]);

	const inputDisabled = mode === "semantic" && status !== "ready";

	if (needsExtraction) {
		return (
			<div className="flex h-full w-full flex-col bg-background">
				<div className="flex items-center gap-2 border-b px-3 py-2">
					<Search className="size-4 shrink-0 text-muted-foreground" />
					<span className="flex-1 text-muted-foreground text-sm">Search</span>
					<Button
						variant="ghost"
						size="icon-sm"
						tooltip="Close search"
						onClick={onClose}
					>
						<X />
					</Button>
				</div>
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
					<ScanText className="size-8 text-muted-foreground/40" />
					<p className="text-muted-foreground text-xs">
						This PDF has no searchable text yet. Extract it to search — scanned
						pages are OCR'd on your device.
					</p>
					<Button
						size="sm"
						onClick={onExtract}
						disabled={extract.isPending}
						variant={!extract.isPending ? "default" : "secondary"}
					>
						{extract.isPending ? (
							<Patrick variant="scanning" size={14} />
						) : null}
						{extract.isPending
							? `Extracting…${extractProgress ? ` ${extractProgress.done}/${extractProgress.total}` : ""}`
							: "Extract text"}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col bg-background">
			<div className="border-b">
				<div className="flex items-center gap-2 px-3 py-2">
					<Search className="size-4 shrink-0 text-muted-foreground" />
					<Input
						autoFocus
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={
							mode === "exact" ? "Find exact text…" : "Search this document…"
						}
						disabled={inputDisabled}
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
				<div className="flex items-center justify-between gap-2 px-3 pb-2">
					<div className="flex gap-0.5 rounded-md bg-muted p-0.5">
						{(["semantic", "exact"] as Mode[]).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => setMode(m)}
								className={cn(
									"rounded px-2 py-0.5 text-xs capitalize",
									mode === m
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{m}
							</button>
						))}
					</div>
					<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
						{mode === "semantic" && (
							<button
								type="button"
								onClick={() => {
									setSort((s) =>
										s === "relevance" ? "appearance" : "relevance",
									);
									setSelected(0);
								}}
								className="hover:text-foreground"
							>
								{sort === "relevance" ? "Relevance" : "Order"}
							</button>
						)}
						{activeList.length > 0 && (
							<>
								<span className="tabular-nums">
									{selected + 1}/{activeList.length}
									{mode === "exact" && truncated ? "+" : ""}
								</span>
								<Button
									variant="ghost"
									size="icon-xxs"
									tooltip="Previous"
									onClick={() => go(-1)}
								>
									<ChevronUp />
								</Button>
								<Button
									variant="ghost"
									size="icon-xxs"
									tooltip="Next"
									onClick={() => go(1)}
								>
									<ChevronDown />
								</Button>
							</>
						)}
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto p-2">
				{mode === "semantic" ? (
					<>
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
								Search by meaning — synonyms and paraphrases match, not just
								exact words.
							</p>
						)}
						{status === "ready" &&
							query.trim() &&
							!searching &&
							results.length === 0 && (
								<p className="p-3 text-muted-foreground text-xs">No matches.</p>
							)}
						<ul className="space-y-1">
							{sortedResults.map((hit, i) => (
								<li key={hit.index}>
									<button
										type="button"
										onClick={() => {
											setSelected(i);
											onJump?.(hit.page);
										}}
										className={cn(
											"w-full rounded-md px-2 py-2 text-left text-xs hover:bg-muted",
											i === selected && "bg-muted",
										)}
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
					</>
				) : (
					<>
						{!query.trim() && (
							<p className="p-3 text-muted-foreground text-xs">
								Find every exact occurrence of a word or phrase.
							</p>
						)}
						{query.trim() && occurrences.length === 0 && (
							<p className="p-3 text-muted-foreground text-xs">No matches.</p>
						)}
						<ul className="space-y-1">
							{occurrences.map((occ, i) => (
								<li key={occ.id}>
									<button
										type="button"
										onClick={() => {
											setSelected(i);
											onJump?.(occ.page);
										}}
										className={cn(
											"w-full rounded-md px-2 py-2 text-left text-xs hover:bg-muted",
											i === selected && "bg-muted",
										)}
									>
										{onJump && (
											<div className="mb-1 text-[10px] text-muted-foreground">
												p. {occ.page}
											</div>
										)}
										<p className="line-clamp-2 leading-snug text-foreground">
											{highlightSnippet(occ.snippet, query)}
										</p>
									</button>
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		</div>
	);
}
