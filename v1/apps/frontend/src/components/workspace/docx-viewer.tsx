import { DocxEditor, type DocxEditorRef } from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-react/styles.css";
import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { SaveStatus } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import { useAutosave } from "@/hooks/use-autosave";
import { useRegisterEditor } from "@/lib/active-editor";
import { useActiveTask } from "@/lib/active-task";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

function formatTokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * Renders a .docx via @eigenpal/docx-editor (ProseMirror). Originals open
 * read-only; Patrick-owned docs are editable and autosave their bytes back to
 * the folder. Patrick-driven tracked changes (the -agents package) come later.
 */
export function DocxViewer({
	filename,
	editable,
}: {
	filename: string;
	editable: boolean;
}) {
	const { activeTaskId } = useActiveTask();
	const editorRef = useRef<DocxEditorRef>(null);
	const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
	const [error, setError] = useState(false);

	// Bumped on every editor mutation; drives the debounced autosave below.
	const [rev, setRev] = useState(0);

	const save = useCallback(async () => {
		const buf = await editorRef.current?.save();
		if (buf) await tasksApi.saveFile(activeTaskId ?? "", filename, buf);
	}, [activeTaskId, filename]);

	const { status } = useAutosave(rev, save, 1000);

	// Editable docs register so Patrick (in the chat panel) can drive tool calls
	// against this live editor; the registry resolves the focused one.
	useRegisterEditor(filename, editorRef, editable);

	useEffect(() => {
		let cancelled = false;
		setBuffer(null);
		setError(false);
		fetch(tasksApi.fileUrl(activeTaskId ?? "", filename))
			.then((r) => r.arrayBuffer())
			.then((buf) => {
				if (!cancelled) setBuffer(buf);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [activeTaskId, filename]);

	if (error) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Couldn't load this document.
			</div>
		);
	}
	if (!buffer) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading…
			</div>
		);
	}

	// readOnly strips the editor chrome (incl. its zoom widget), so the viewer
	// gets its own floating zoom pill — mirroring the PDF viewer.
	if (!editable) return <ReadOnlyDocx buffer={buffer} />;

	return (
		<div className="h-full overflow-auto">
			<DocxEditor
				ref={editorRef}
				documentBuffer={buffer}
				author="Attorney"
				onChange={() => setRev((r) => r + 1)}
				renderTitleBarRight={() => <SaveStatus status={status} />}
			/>
		</div>
	);
}

function ReadOnlyDocx({ buffer }: { buffer: ArrayBuffer }) {
	const ref = useRef<DocxEditorRef>(null);
	const [zoom, setZoom] = useState(1);
	const [page, setPage] = useState(1);
	const [pages, setPages] = useState(0);
	const [tokens, setTokens] = useState<number | null>(null);
	const gotTokens = useRef(false);

	// The editor has no page-change event, so poll its current/total page. Token
	// estimate (~chars/4) is computed once the document agent is available.
	useEffect(() => {
		const id = setInterval(() => {
			const ed = ref.current;
			if (!ed) return;
			setPage(ed.getCurrentPage() || 1);
			setPages(ed.getTotalPages() || 0);
			if (!gotTokens.current) {
				const chars = ed.getAgent()?.getCharacterCount(true);
				if (chars && chars > 0) {
					gotTokens.current = true;
					setTokens(Math.ceil(chars / 4));
				}
			}
		}, 400);
		return () => clearInterval(id);
	}, []);

	const apply = (next: number) => {
		const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +next.toFixed(2)));
		ref.current?.setZoom(z);
		setZoom(z);
	};

	return (
		<div className="relative h-full">
			<div className="h-full overflow-auto">
				<DocxEditor
					ref={ref}
					documentBuffer={buffer}
					readOnly
					showZoomControl={false}
				/>
			</div>

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
					size="icon"
					className="size-6"
					title="Zoom out"
					onClick={() => apply(zoom - ZOOM_STEP)}
				>
					<Minus />
				</Button>
				<span className="w-9 text-center tabular-nums">
					{Math.round(zoom * 100)}%
				</span>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					title="Zoom in"
					onClick={() => apply(zoom + ZOOM_STEP)}
				>
					<Plus />
				</Button>
				{tokens != null && (
					<>
						<span className="h-4 w-px bg-border" />
						<span
							className="px-1.5 text-muted-foreground"
							title="Estimated input tokens (~characters ÷ 4)"
						>
							~{formatTokens(tokens)} tokens
						</span>
					</>
				)}
			</div>
		</div>
	);
}
