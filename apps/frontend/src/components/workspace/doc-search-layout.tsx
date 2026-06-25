import { Search } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { DocSearchPanel } from "@/components/workspace/doc-search";
import {
	findPage,
	highlightText,
	parseLeaf,
} from "@/lib/search/citation-match";
import { useCitationNav } from "@/lib/search/citation-nav";
import {
	DocSearchHighlightProvider,
	useDocSearchHighlights,
} from "@/lib/search/doc-search-context";
import { useDocHighlights } from "@/lib/search/use-doc-highlights";
import { useWorkspace } from "@/lib/workspace";

// Inside the provider: reads the panel's writes and highlights them in the document
// container. Rendered as a sibling so the highlighting works for any viewer with no
// per-viewer wiring.
function HighlightBinder({
	containerRef,
}: {
	containerRef: RefObject<HTMLDivElement | null>;
}) {
	const { texts, selected, scrollKey } = useDocSearchHighlights();
	useDocHighlights(containerRef, texts, selected, scrollKey);
	return null;
}

// Bridges an app-level citation click (from a chart cell) into THIS document's highlight
// provider: when a pending target names this file, resolve it (snippet locator → label
// fallback) and scroll to + highlight it. For a PDF, derive the page first (from the
// extracted text, else the "leaf N" label) and jump there, so a passage on an unrendered
// page is reached. The token dedupes so a repeat click on the same citation re-fires.
function CitationConsumer({
	filename,
	onJump,
	loadPages,
}: {
	filename: string;
	onJump?: (page: number) => void;
	loadPages: () => Promise<{ text: string }[] | null>;
}) {
	const { pending } = useCitationNav();
	const { setHighlights } = useDocSearchHighlights();
	const consumed = useRef(0);
	useEffect(() => {
		if (!pending || pending.filename !== filename) return;
		if (pending.token === consumed.current) return;
		consumed.current = pending.token;
		const label = pending.label ?? "";
		const text = highlightText(pending.snippet, label);
		const apply = () =>
			setHighlights(text ? [text] : [], text ? { text, nth: 0 } : null, true);
		// PDF: jump to the page (the text layer then renders and the snippet highlights).
		if (onJump) {
			(async () => {
				let page: number | null = null;
				if (pending.snippet?.trim()) {
					const pages = await loadPages();
					if (pages) page = findPage(pending.snippet, pages);
				}
				if (page == null) page = parseLeaf(label);
				if (page != null) onJump(page);
				apply();
			})();
		} else {
			apply();
		}
	}, [pending, filename, setHighlights, onJump, loadPages]);
	return null;
}

const MOD_LABEL =
	typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
		? "⌘F"
		: "Ctrl+F";

/**
 * Wraps a document viewer so search opens as a resizable panel BESIDE the document
 * (not an overlay over it), with a uniform top-right trigger (⌘F). Owns the search
 * state, so the viewers stay thin. The document panel stays mounted when search
 * toggles — toggling must never reload the (heavy) viewer.
 */
export function DocSearchLayout({
	taskId,
	filename,
	loadPages,
	onJump,
	children,
}: {
	taskId: string;
	filename: string;
	loadPages: () => Promise<{ text: string }[] | null>;
	onJump?: (page: number) => void;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);
	const { focused } = useWorkspace();

	// ⌘F / Ctrl+F opens search for the focused document only, so a multi-column
	// layout doesn't open every panel at once.
	useEffect(() => {
		if (focused !== filename) return;
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [focused, filename]);

	return (
		<DocSearchHighlightProvider>
			<HighlightBinder containerRef={contentRef} />
			<CitationConsumer
				filename={filename}
				onJump={onJump}
				loadPages={loadPages}
			/>
			<ResizablePanelGroup orientation="horizontal" className="h-full">
				<ResizablePanel id="doc-content" minSize="40%">
					<div ref={contentRef} className="relative h-full">
						{children}
						{!open && (
							<Button
								variant="ghost"
								size="sm"
								tooltip="Search this document"
								className="absolute top-3 right-3 z-10 h-7 gap-1.5 border bg-muted shadow-md hover:bg-muted/80"
								onClick={() => setOpen(true)}
							>
								<Search className="size-3.5" />
								<Kbd className="bg-background">{MOD_LABEL}</Kbd>
							</Button>
						)}
					</div>
				</ResizablePanel>
				{open && (
					<>
						<ResizableHandle />
						<ResizablePanel
							id="doc-search"
							defaultSize="32%"
							minSize="22%"
							maxSize="48%"
						>
							<DocSearchPanel
								taskId={taskId}
								filename={filename}
								loadPages={loadPages}
								onJump={onJump}
								onClose={() => setOpen(false)}
							/>
						</ResizablePanel>
					</>
				)}
			</ResizablePanelGroup>
		</DocSearchHighlightProvider>
	);
}
