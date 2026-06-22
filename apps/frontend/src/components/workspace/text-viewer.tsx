import { Info, Search } from "lucide-react";
import {
	Fragment,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { tasksApi } from "@/api/tasks";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import { DocSearchPanel } from "@/components/workspace/doc-search";
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";
import { recordDocSize } from "@/lib/doc-size";

// Read-only viewer for the plain-text/markdown documents Patrick saves (retrieved
// publications). The content is simple — headings, a metadata header, numbered
// claims, and paragraphs — so we parse it ourselves rather than pull in a
// markdown engine: a streaming renderer froze the tab on long specifications.
//
// Conventions written by apps/api/src/lib/patents/markdown.ts: `# ` / `## `
// headings, `**N.**` claim openers with tab-indented sub-paragraph lines, blank
// lines between sub-paragraphs, and `**bold**` / `*italic*` inline.

type Block =
	| { kind: "h1"; text: string }
	| { kind: "h2"; text: string }
	| { kind: "claim"; num: string; preamble: string; groups: string[][] }
	| { kind: "para"; lines: string[] };

const CLAIM_RE = /^\*\*(\d+)\.\*\*\s?(.*)$/;
const isBoundary = (l: string) =>
	l.startsWith("# ") || l.startsWith("## ") || CLAIM_RE.test(l);

function parseDoc(md: string): Block[] {
	const lines = md.replace(/\r/g, "").split("\n");
	const blocks: Block[] = [];
	let inClaims = false;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? "";
		if (line.trim() === "") {
			i++;
			continue;
		}
		if (line.startsWith("# ")) {
			blocks.push({ kind: "h1", text: line.slice(2).trim() });
			inClaims = false;
			i++;
			continue;
		}
		if (line.startsWith("## ")) {
			const text = line.slice(3).trim();
			blocks.push({ kind: "h2", text });
			inClaims = text.toLowerCase() === "claims";
			i++;
			continue;
		}

		const cm = inClaims ? CLAIM_RE.exec(line) : null;
		if (cm) {
			i++;
			const sub: string[] = [];
			while (i < lines.length && !isBoundary(lines[i] ?? "")) {
				sub.push(lines[i] ?? "");
				i++;
			}
			// Split the claim's sub-lines into sub-paragraphs on blank lines.
			const groups: string[][] = [];
			let cur: string[] = [];
			for (const s of sub) {
				if (s.trim() === "") {
					if (cur.length) groups.push(cur);
					cur = [];
				} else {
					cur.push(s.replace(/^\t+/, "").trim());
				}
			}
			if (cur.length) groups.push(cur);
			blocks.push({
				kind: "claim",
				num: cm[1] ?? "",
				preamble: (cm[2] ?? "").trim(),
				groups,
			});
			continue;
		}

		const para: string[] = [];
		while (
			i < lines.length &&
			(lines[i] ?? "").trim() !== "" &&
			!isBoundary(lines[i] ?? "")
		) {
			para.push((lines[i] ?? "").trim());
			i++;
		}
		blocks.push({ kind: "para", lines: para });
	}
	return blocks;
}

const INLINE_RE = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

/** Minimal inline formatting: `**bold**` and `*italic*`. */
function inline(text: string, key: string): ReactNode[] {
	const out: ReactNode[] = [];
	let last = 0;
	let n = 0;
	INLINE_RE.lastIndex = 0;
	for (let m = INLINE_RE.exec(text); m !== null; m = INLINE_RE.exec(text)) {
		if (m.index > last) out.push(text.slice(last, m.index));
		if (m[1] != null) out.push(<strong key={`${key}-${n++}`}>{m[1]}</strong>);
		else out.push(<em key={`${key}-${n++}`}>{m[2]}</em>);
		last = INLINE_RE.lastIndex;
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

/** A run of lines rendered tight, with `<br>` between them. */
function Lines({ lines, k }: { lines: string[]; k: string }) {
	return (
		<>
			{lines.map((l, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: stable parsed order
				<Fragment key={i}>
					{i > 0 && <br />}
					{inline(l, `${k}-${i}`)}
				</Fragment>
			))}
		</>
	);
}

function DocBlock({ block, k }: { block: Block; k: string }) {
	if (block.kind === "h1")
		return <h1 className="mb-2 font-semibold text-lg">{block.text}</h1>;
	if (block.kind === "h2")
		return (
			<h2 className="mt-6 mb-2 font-medium text-muted-foreground text-sm uppercase tracking-wide">
				{block.text}
			</h2>
		);
	if (block.kind === "claim")
		return (
			<div className="mt-4">
				<p className="leading-relaxed">
					{inline(`**${block.num}.** ${block.preamble}`, `${k}-p`)}
				</p>
				{block.groups.map((g, gi) => (
					<p
						// biome-ignore lint/suspicious/noArrayIndexKey: stable parsed order
						key={gi}
						className="mt-1.5 pl-6 leading-relaxed"
					>
						<Lines lines={g} k={`${k}-g${gi}`} />
					</p>
				))}
			</div>
		);
	return (
		<p className="mt-3 leading-relaxed">
			<Lines lines={block.lines} k={`${k}-l`} />
		</p>
	);
}

export function TextViewer({ filename }: { filename: string }) {
	const { activeTaskId } = useActiveTask();
	const [text, setText] = useState<string | null>(null);
	const [error, setError] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);

	// Retrieved publications are already clean text, so search the markdown
	// directly (no extraction step).
	const loadSearchPages = useCallback(
		async () => (text ? [{ text }] : null),
		[text],
	);

	useEffect(() => {
		let cancelled = false;
		setText(null);
		setError(false);
		(async () => {
			try {
				const res = await fetch(tasksApi.fileUrl(activeTaskId ?? "", filename));
				if (!res.ok) throw new Error(String(res.status));
				const body = await res.text();
				if (!cancelled) {
					setText(body);
					recordDocSize(activeTaskId ?? "", filename, { chars: body.length });
				}
			} catch {
				if (!cancelled) setError(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeTaskId, filename]);

	const blocks = useMemo(() => (text ? parseDoc(text) : []), [text]);
	// Provenance: read the retrieved doc's persisted source (set when fetched),
	// rather than re-parsing it out of the rendered markdown.
	const { data: documents } = useTaskDocuments(activeTaskId);
	const source = documents?.find((d) => d.filename === filename)?.source;

	if (error) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
				Couldn't load this file.
			</div>
		);
	}
	if (text === null) {
		return (
			<div className="flex h-full items-center justify-center bg-background">
				<Patrick variant="drawing" size={48} label="Loading" />
			</div>
		);
	}

	// Themed surface (not the faux-paper canvas the PDF/docx viewers use): this is
	// Patrick-generated text, and the paper stays light in dark mode, which would
	// leave the foreground-coloured text invisible.
	return (
		<div className="relative h-full">
			<div className="h-full overflow-auto bg-background px-6 py-8 text-foreground">
				<div className="mx-auto max-w-3xl text-sm">
					{source && (
						<div className="mb-4 flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
							<Info className="mt-0.5 size-3.5 shrink-0" />
							<span>
								Retrieved from{" "}
								<span className="font-medium text-foreground">{source}</span> —
								verify against the original publication.
							</span>
						</div>
					)}
					{blocks.map((block, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: stable parsed order
						<DocBlock key={i} block={block} k={`b${i}`} />
					))}
				</div>
			</div>

			{!searchOpen && (
				<Button
					variant="outline"
					size="icon-sm"
					tooltip="Search this document"
					className="absolute top-3 right-3 z-10 bg-background/95 shadow-sm backdrop-blur"
					onClick={() => setSearchOpen(true)}
				>
					<Search />
				</Button>
			)}
			{searchOpen && (
				<DocSearchPanel
					taskId={activeTaskId ?? ""}
					filename={filename}
					loadPages={loadSearchPages}
					onClose={() => setSearchOpen(false)}
				/>
			)}
		</div>
	);
}
