import type {
	ExtractedDoc,
	ExtractedPage,
	ExtractedWord,
} from "@patrick/shared";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker, type Worker } from "tesseract.js";
import { tasksApi } from "@/api/tasks";

GlobalWorkerOptions.workerSrc = workerUrl;

// Render scanned pages around this width (~250 dpi for A4) — a good balance of
// OCR accuracy vs work.
const OCR_TARGET_WIDTH = 2000;

// All tesseract assets are self-hosted under /tesseract (see vite.config) so OCR
// runs fully offline — no CDN.
const TESS = {
	workerPath: "/tesseract/worker.min.js",
	corePath: "/tesseract",
	langPath: "/tesseract",
};

// biome-ignore lint/suspicious/noExplicitAny: pdfjs text item shape is loose.
const itemStr = (i: any): string => (typeof i?.str === "string" ? i.str : "");

/**
 * Extract a PDF's text for the selectable overlay + the agent's text context.
 * Per page: a real text layer is read straight from pdfjs (free, exact); a
 * scanned page is rendered to a canvas and OCR'd with tesseract.js, capturing
 * per-word boxes (normalized to page fraction, so they scale to any zoom).
 */
export async function extractText(
	taskId: string,
	filename: string,
	onProgress?: (done: number, total: number) => void,
): Promise<ExtractedDoc> {
	const buf = await (
		await fetch(tasksApi.fileUrl(taskId, filename))
	).arrayBuffer();
	const loadingTask = getDocument({
		data: buf,
		wasmUrl: "/pdfjs/wasm/",
		cMapUrl: "/pdfjs/cmaps/",
		cMapPacked: true,
		standardFontDataUrl: "/pdfjs/standard_fonts/",
	});
	const pdf = await loadingTask.promise;

	const pages: ExtractedPage[] = [];
	let worker: Worker | undefined;
	let anyOcr = false;
	try {
		for (let n = 1; n <= pdf.numPages; n++) {
			const page = await pdf.getPage(n);
			const native = (await page.getTextContent()).items
				.map(itemStr)
				.join(" ")
				.trim();
			if (native.length > 20) {
				pages.push({ text: native });
			} else {
				worker ??= await createWorker("eng", 1, TESS);
				const base = page.getViewport({ scale: 1 });
				const scale = Math.min(4, OCR_TARGET_WIDTH / base.width);
				const viewport = page.getViewport({ scale });
				const canvas = document.createElement("canvas");
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				if (canvas.getContext("2d")) {
					await page.render({ canvas, viewport }).promise;
					const { data } = await worker.recognize(canvas, {}, { blocks: true });
					const words: ExtractedWord[] = (data.blocks ?? [])
						.flatMap((b) => b.paragraphs ?? [])
						.flatMap((p) => p.lines ?? [])
						.flatMap((l) => l.words ?? [])
						.map((w) => ({
							t: w.text,
							x0: w.bbox.x0 / canvas.width,
							y0: w.bbox.y0 / canvas.height,
							x1: w.bbox.x1 / canvas.width,
							y1: w.bbox.y1 / canvas.height,
						}));
					pages.push({ text: data.text.trim(), words });
					anyOcr = true;
				} else {
					pages.push({ text: "" });
				}
			}
			onProgress?.(n, pdf.numPages);
		}
	} finally {
		await worker?.terminate();
		loadingTask.destroy();
	}
	return { source: anyOcr ? "ocr" : "pdf", pages };
}
