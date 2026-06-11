import { estimatePdfTokens } from "@patrick/shared";
import { Minus, Plus } from "lucide-react";
import {
	GlobalWorkerOptions,
	getDocument,
	type PDFPageProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useMemo, useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { formatTokens } from "@/lib/format";

GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const STEP = 0.2;
// Render the current page ± this many pages; the rest stay blank placeholders.
const OVERSCAN = 3;

export function PdfViewer({ filename }: { filename: string }) {
	const { activeTaskId } = useActiveTask();
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);

	const [pages, setPages] = useState<PDFPageProxy[]>([]);
	const [scale, setScale] = useState(1.2);
	const [current, setCurrent] = useState(1);
	const [error, setError] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

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
				if (!cancelled) setPages(ps);
			} catch {
				if (!cancelled) setError(true);
			}
		})();

		return () => {
			cancelled = true;
			loadingTask?.destroy();
		};
	}, [activeTaskId, filename]);

	const tokens =
		pages.length && profile
			? estimatePdfTokens(pages.length, profile.ai.detailedModel)
			: null;

	function onScroll() {
		const el = scrollRef.current;
		if (!el) return;
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
		<div className="relative h-full">
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
					size="icon"
					className="size-6"
					title="Zoom out"
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
					size="icon"
					className="size-6"
					title="Zoom in"
					onClick={() =>
						setScale((s) => Math.min(MAX_SCALE, +(s + STEP).toFixed(2)))
					}
				>
					<Plus />
				</Button>
				{tokens != null && (
					<>
						<span className="h-4 w-px bg-border" />
						<span
							className="px-1.5 text-muted-foreground"
							title="Estimated input tokens for your detailed model"
						>
							~{formatTokens(tokens)} tokens
						</span>
					</>
				)}
			</div>
		</div>
	);
}

function PdfPage({
	page,
	scale,
	pageNumber,
	active,
}: {
	page: PDFPageProxy;
	scale: number;
	pageNumber: number;
	active: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
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
			{/* Annotation overlay — empty for now, ready for highlights/comments. */}
			<div className="absolute inset-0" />
		</div>
	);
}
