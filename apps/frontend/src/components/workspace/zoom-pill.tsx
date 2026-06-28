import type { DocxEditorRef } from "@eigenpal/docx-editor-react";
import { Button } from "@patrick/ui/components/button";
import { Minus, Plus } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useState } from "react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

/**
 * Floating zoom + page-count pill, bottom-center. The editor exposes no
 * page-change event, so we poll current/total page; zoom drives the editor via
 * its imperative `setZoom`. Shared by the editable and read-only viewers (the
 * toolbar carries no zoom widget). `children` appends extra readouts (the
 * read-only viewer's token estimate).
 */
export function ZoomPill({
	editorRef,
	children,
}: {
	editorRef: RefObject<DocxEditorRef | null>;
	children?: ReactNode;
}) {
	const [zoom, setZoom] = useState(1);
	const [page, setPage] = useState(1);
	const [pages, setPages] = useState(0);

	useEffect(() => {
		const id = setInterval(() => {
			const ed = editorRef.current;
			if (!ed) return;
			setPage(ed.getCurrentPage() || 1);
			setPages(ed.getTotalPages() || 0);
		}, 400);
		return () => clearInterval(id);
	}, [editorRef]);

	const apply = (next: number) => {
		const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +next.toFixed(2)));
		editorRef.current?.setZoom(z);
		setZoom(z);
	};

	return (
		<div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/95 px-2 py-1 text-xs shadow-md backdrop-blur">
			{pages > 0 && (
				<>
					<span className="px-1.5 tabular-nums">
						{page} / {pages}
					</span>
					<span className="h-4 w-px bg-border" />
				</>
			)}
			<Button
				variant="ghost"
				size="icon-sm"
				tooltip="Zoom out"
				onClick={() => apply(zoom - ZOOM_STEP)}
			>
				<Minus />
			</Button>
			<span className="w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
			<Button
				variant="ghost"
				size="icon-sm"
				tooltip="Zoom in"
				onClick={() => apply(zoom + ZOOM_STEP)}
			>
				<Plus />
			</Button>
			{children}
		</div>
	);
}
