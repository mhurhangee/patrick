import { DocxEditor, type DocxEditorRef } from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-react/styles.css";
import { estimateTextTokens } from "@patrick/shared";
import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { Patrick } from "@/components/patrick";
import { SaveStatus } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/tooltip";
import { useAutosave } from "@/hooks/use-autosave";
import { useRegisterEditor } from "@/lib/active-editor";
import { useActiveTask } from "@/lib/active-task";
import { recordDocSize } from "@/lib/doc-size";
import { formatTokens } from "@/lib/format";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

// Centered drawing mark — the package's loadingIndicator slot renders its child
// raw (top-left), so it must center itself; also used for our pre-fetch state.
function DocxLoading() {
	return (
		<div className="flex h-full w-full items-center justify-center bg-[var(--doc-paper)]">
			<Patrick variant="drawing" size={48} label="Loading document" />
		</div>
	);
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
		return <DocxLoading />;
	}

	// readOnly strips the editor chrome (incl. its zoom widget), so the viewer
	// gets its own floating zoom pill — mirroring the PDF viewer.
	if (!editable) return <ReadOnlyDocx buffer={buffer} filename={filename} />;

	return (
		<div className="h-full overflow-auto">
			<DocxEditor
				ref={editorRef}
				documentBuffer={buffer}
				author="Attorney"
				onChange={() => setRev((r) => r + 1)}
				renderTitleBarRight={() => <SaveStatus status={status} />}
				loadingIndicator={<DocxLoading />}
			/>
		</div>
	);
}

function ReadOnlyDocx({
	buffer,
	filename,
}: {
	buffer: ArrayBuffer;
	filename: string;
}) {
	const { activeTaskId } = useActiveTask();
	const ref = useRef<DocxEditorRef>(null);
	const [zoom, setZoom] = useState(1);
	const [page, setPage] = useState(1);
	const [pages, setPages] = useState(0);
	const [tokens, setTokens] = useState<number | null>(null);
	const gotTokens = useRef(false);

	// The editor has no page-change event, so poll its current/total page. The
	// character count (once the document agent is available) drives the token
	// estimate and is recorded so the context control can cost this source.
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
					setTokens(estimateTextTokens(chars));
					recordDocSize(activeTaskId ?? "", filename, { chars });
				}
			}
		}, 400);
		return () => clearInterval(id);
	}, [activeTaskId, filename]);

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
					loadingIndicator={<DocxLoading />}
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
					size="icon-sm"
					tooltip="Zoom out"
					onClick={() => apply(zoom - ZOOM_STEP)}
				>
					<Minus />
				</Button>
				<span className="w-9 text-center tabular-nums">
					{Math.round(zoom * 100)}%
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					tooltip="Zoom in"
					onClick={() => apply(zoom + ZOOM_STEP)}
				>
					<Plus />
				</Button>
				{tokens != null && (
					<>
						<span className="h-4 w-px bg-border" />
						<InfoTooltip label="Estimated input tokens (~characters ÷ 4)">
							<span className="px-1.5 text-muted-foreground">
								~{formatTokens(tokens)} tokens
							</span>
						</InfoTooltip>
					</>
				)}
			</div>
		</div>
	);
}
