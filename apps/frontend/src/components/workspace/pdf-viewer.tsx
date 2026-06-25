import { type ExtractedWord, estimatePdfTokens } from "@patrick/shared";
import { Minus, Plus } from "lucide-react";
import {
	GlobalWorkerOptions,
	getDocument,
	type PDFPageProxy,
	TextLayer,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { tasksApi } from "@/api/tasks";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/tooltip";
import { DocSearchLayout } from "@/components/workspace/doc-search-layout";
import { useProfile } from "@/hooks/use-profiles";
import { useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { recordDocSize } from "@/lib/doc-size";
import { formatTokens } from "@/lib/format";

GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const STEP = 0.2;
// Render the current page ± this many pages; the rest stay blank placeholders.
const OVERSCAN = 3;

// Inactive read-only tabs unmount (PDFs are heavy to keep alive), so remember each PDF's
// scroll position by id and restore it on remount — otherwise PDF → chart → PDF dumps you
// back at the top. Module-level so it survives the unmount.
const scrollMemory = new Map<string, number>();

export function PdfViewer({ filename }: { filename: string }) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);

	const [pages, setPages] = useState<PDFPageProxy[]>([]);
	const [scale, setScale] = useState(1.2);
	const [current, setCurrent] = useState(1);
	const [error, setError] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const scrollKey = `${activeTaskId ?? ""}|${filename}`;
	// A citation jump that arrives before the pages render is parked here and applied on load,
	// so it isn't lost to the timing — and it suppresses the scroll restore (below) so the two
	// don't fight (the citation, being the explicit intent, wins).
	const pendingJump = useRef<number | null>(null);

	// Restore the remembered scroll once the page divs exist (their heights are reserved up
	// front from the viewport, so the position is valid immediately) — unless a citation jump
	// is queued, which owns the scroll instead.
	useEffect(() => {
		if (!pages.length || pendingJump.current != null) return;
		const y = scrollMemory.get(scrollKey);
		if (y && scrollRef.current) scrollRef.current.scrollTop = y;
	}, [pages.length, scrollKey]);

	// Search over this PDF's extracted text. Needs text — if it hasn't been
	// extracted, the panel says so.
	const loadSearchPages = useCallback(async () => {
		try {
			const ext = await tasksApi.extractedText(activeTaskId ?? "", filename);
			return ext.pages.map((p) => ({ text: p.text }));
		} catch {
			return null;
		}
	}, [activeTaskId, filename]);

	const jumpToPage = useCallback((page: number) => {
		const el = scrollRef.current?.querySelector<HTMLElement>(
			`[data-page="${page}"]`,
		);
		if (el) {
			pendingJump.current = null;
			el.scrollIntoView({ behavior: "smooth", block: "start" });
		} else {
			// Pages not rendered yet (the jump beat the load) — apply it once they are.
			pendingJump.current = page;
		}
	}, []);

	// Apply a parked citation jump when the pages render. Runs after the restore effect
	// (declared above), so it lands on the cited page rather than the remembered position.
	useEffect(() => {
		if (!pages.length || pendingJump.current == null) return;
		const page = pendingJump.current;
		pendingJump.current = null;
		scrollRef.current
			?.querySelector<HTMLElement>(`[data-page="${page}"]`)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	}, [pages.length]);

	useEffect(() => {
		let cancelled = false;
		let loadingTask: ReturnType<typeof getDocument> | undefined;
		setPages([]);
		setError(false);
		setCurrent(1);

		(async () => {
			try {
				const url = tasksApi.fileUrl(activeTaskId ?? "", filename);
				const buf = await (await fetch(url)).arrayBuffer();
				loadingTask = getDocument({
					data: buf,
					wasmUrl: "/pdfjs/wasm/",
					cMapUrl: "/pdfjs/cmaps/",
					cMapPacked: true,
					standardFontDataUrl: "/pdfjs/standard_fonts/",
				});
				const doc = await loadingTask.promise;
				const ps = await Promise.all(
					Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)),
				);
				if (!cancelled) {
					setPages(ps);
					recordDocSize(activeTaskId ?? "", filename, { pages: doc.numPages });
				}
			} catch {
				if (!cancelled) setError(true);
			}
		})();

		return () => {
			cancelled = true;
			loadingTask?.destroy();
		};
	}, [activeTaskId, filename]);

	// For scanned PDFs that have been OCR'd, load the per-page word boxes that
	// drive the selectable overlay. Native text PDFs use pdfjs's live text layer.
	const { data: documents } = useTaskDocuments(activeTaskId);
	const isExtracted =
		documents?.find((d) => d.filename === filename)?.extracted ?? false;
	const [ocrPages, setOcrPages] = useState<(ExtractedWord[] | undefined)[]>([]);
	useEffect(() => {
		if (!isExtracted) {
			setOcrPages([]);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const ext = await tasksApi.extractedText(activeTaskId ?? "", filename);
				if (!cancelled) setOcrPages(ext.pages.map((p) => p.words));
			} catch {
				if (!cancelled) setOcrPages([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeTaskId, filename, isExtracted]);

	const tokens =
		pages.length && profile
			? estimatePdfTokens(pages.length, profile.ai.model)
			: null;

	function onScroll() {
		const el = scrollRef.current;
		if (!el) return;
		scrollMemory.set(scrollKey, el.scrollTop);
		const mid = el.scrollTop + el.clientHeight / 2;
		let cur = 1;
		for (const pe of el.querySelectorAll<HTMLElement>("[data-page]")) {
			if (pe.offsetTop <= mid) cur = Number(pe.dataset.page);
		}
		setCurrent(cur);
	}

	if (error) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Couldn't load this PDF.
			</div>
		);
	}
	if (pages.length === 0) {
		return (
			<div className="flex h-full items-center justify-center bg-[var(--doc-paper)]">
				<Patrick variant="drawing" size={48} label="Loading PDF" />
			</div>
		);
	}

	return (
		<DocSearchLayout
			taskId={activeTaskId ?? ""}
			filename={filename}
			loadPages={loadSearchPages}
			onJump={jumpToPage}
		>
			<div
				ref={scrollRef}
				onScroll={onScroll}
				className="h-full overflow-auto bg-[var(--doc-paper)] p-4"
			>
				<div className="mx-auto flex w-fit flex-col items-center gap-4">
					{pages.map((page, i) => (
						<PdfPage
							key={page.ref?.num ?? i}
							page={page}
							scale={scale}
							pageNumber={i + 1}
							active={Math.abs(i + 1 - current) <= OVERSCAN}
							ocrWords={ocrPages[i]}
						/>
					))}
				</div>
			</div>

			<div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/95 px-2 py-1 text-xs shadow-md backdrop-blur">
				<span className="px-1.5 tabular-nums">
					{current} / {pages.length}
				</span>
				<span className="h-4 w-px bg-border" />
				<Button
					variant="ghost"
					size="icon-sm"
					tooltip="Zoom out"
					onClick={() =>
						setScale((s) => Math.max(MIN_SCALE, +(s - STEP).toFixed(2)))
					}
				>
					<Minus />
				</Button>
				<span className="w-9 text-center tabular-nums">
					{Math.round(scale * 100)}%
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					tooltip="Zoom in"
					onClick={() =>
						setScale((s) => Math.min(MAX_SCALE, +(s + STEP).toFixed(2)))
					}
				>
					<Plus />
				</Button>
				{tokens != null && (
					<>
						<span className="h-4 w-px bg-border" />
						<InfoTooltip label="Estimated input tokens for the chat's model">
							<span className="px-1.5 text-muted-foreground">
								~{formatTokens(tokens)} tokens
							</span>
						</InfoTooltip>
					</>
				)}
			</div>
		</DocSearchLayout>
	);
}

function PdfPage({
	page,
	scale,
	pageNumber,
	active,
	ocrWords,
}: {
	page: PDFPageProxy;
	scale: number;
	pageNumber: number;
	active: boolean;
	ocrWords?: ExtractedWord[];
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const textRef = useRef<HTMLDivElement>(null);
	// Logical viewport drives CSS size (always reserved); we paint the backing
	// store at ×dpr only while `active`, and free it when scrolled away.
	const viewport = useMemo(() => page.getViewport({ scale }), [page, scale]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (!active) {
			canvas.width = 0;
			canvas.height = 0;
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		const renderViewport = page.getViewport({ scale: scale * dpr });
		canvas.width = Math.floor(renderViewport.width);
		canvas.height = Math.floor(renderViewport.height);
		const task = page.render({ canvas, viewport: renderViewport });
		task.promise.catch(() => {}); // ignore cancellation on re-render/unmount
		return () => task.cancel();
	}, [page, scale, active]);

	// Selectable text overlay aligned over the canvas. Native text PDFs use
	// pdfjs's live text layer; OCR'd scans get a hand-built overlay positioned
	// from the stored word boxes. Only while active, matching the canvas.
	useEffect(() => {
		const container = textRef.current;
		if (!container) return;
		if (!active) {
			container.replaceChildren();
			return;
		}
		if (ocrWords) {
			// Place each word's transparent span at its box (page fraction → px),
			// then scaleX to the box width so the selection tracks the scan glyphs.
			const frag = document.createDocumentFragment();
			const fit: { el: HTMLSpanElement; w: number }[] = [];
			for (const word of ocrWords) {
				const el = document.createElement("span");
				el.textContent = word.t;
				el.style.left = `${word.x0 * viewport.width}px`;
				el.style.top = `${word.y0 * viewport.height}px`;
				el.style.fontSize = `${Math.max(1, (word.y1 - word.y0) * viewport.height)}px`;
				frag.appendChild(el);
				fit.push({ el, w: (word.x1 - word.x0) * viewport.width });
			}
			container.replaceChildren(frag);
			for (const { el, w } of fit) {
				const natural = el.offsetWidth;
				if (natural > 0) el.style.transform = `scaleX(${w / natural})`;
				// Trailing space so copying across words yields spaces (appended after
				// measuring, so the width-fit tracks the word, not the space).
				el.append(" ");
			}
			return () => container.replaceChildren();
		}
		const layer = new TextLayer({
			textContentSource: page.streamTextContent(),
			container,
			viewport,
		});
		layer.render().catch(() => {}); // ignore cancellation
		return () => {
			layer.cancel();
			container.replaceChildren();
		};
	}, [page, active, viewport, ocrWords]);

	return (
		<div
			data-page={pageNumber}
			className="relative bg-white shadow-sm"
			style={{ width: viewport.width, height: viewport.height }}
		>
			<canvas
				ref={canvasRef}
				className="block"
				style={{ width: viewport.width, height: viewport.height }}
			/>
			{/* Selectable text overlay — pdfjs text layer, or an OCR-box overlay. */}
			<div
				ref={textRef}
				className={ocrWords ? "ocrLayer" : "textLayer"}
				style={
					{
						"--scale-factor": scale,
						"--total-scale-factor": scale,
					} as CSSProperties
				}
			/>
		</div>
	);
}
