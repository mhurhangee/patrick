import { DocxEditor, type DocxEditorRef } from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-core/styles/editor.css";
import { estimateTextTokens } from "@patrick/shared";
import { InfoTooltip } from "@patrick/ui/components/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { Patrick } from "@/components/patrick";
import { SaveStatus } from "@/components/save-status";
import { useTheme } from "@/components/theme-provider";
import { useAutosave } from "@/hooks/use-autosave";
import { useRegisterEditor } from "@/lib/active-editor";
import { useActiveTask } from "@/lib/active-task";
import { recordDocSize } from "@/lib/doc-size";
import { formatTokens } from "@/lib/format";
import { ZoomPill } from "./zoom-pill";

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
	const { resolvedTheme } = useTheme();
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
		<div className="relative h-full">
			<div className="h-full overflow-auto">
				<DocxEditor
					ref={editorRef}
					documentBuffer={buffer}
					author="Attorney"
					colorMode={resolvedTheme}
					onChange={() => setRev((r) => r + 1)}
					renderTitleBarRight={() => <SaveStatus status={status} />}
					loadingIndicator={<DocxLoading />}
				/>
			</div>
			<ZoomPill editorRef={editorRef} />
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
	const { resolvedTheme } = useTheme();
	const ref = useRef<DocxEditorRef>(null);
	const [tokens, setTokens] = useState<number | null>(null);
	const gotTokens = useRef(false);

	// The character count (once the document agent is available) drives the token
	// estimate and is recorded so the context control can cost this source.
	useEffect(() => {
		const id = setInterval(() => {
			const ed = ref.current;
			if (!ed || gotTokens.current) return;
			const chars = ed.getAgent()?.getCharacterCount(true);
			if (chars && chars > 0) {
				gotTokens.current = true;
				setTokens(estimateTextTokens(chars));
				recordDocSize(activeTaskId ?? "", filename, { chars });
			}
		}, 400);
		return () => clearInterval(id);
	}, [activeTaskId, filename]);

	return (
		<div className="relative h-full">
			<div className="h-full overflow-auto">
				<DocxEditor
					ref={ref}
					documentBuffer={buffer}
					readOnly
					colorMode={resolvedTheme}
					loadingIndicator={<DocxLoading />}
				/>
			</div>

			<ZoomPill editorRef={ref}>
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
			</ZoomPill>
		</div>
	);
}
