import { DocxEditor, type DocxEditorRef } from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-react/styles.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { SaveStatus } from "@/components/save-status";
import { useAutosave } from "@/hooks/use-autosave";
import { useActiveTask } from "@/lib/active-task";

/**
 * Renders a .docx via @eigenpal/docx-editor (ProseMirror). Originals open
 * read-only; Patrick-owned docs are editable and autosave their bytes back to
 * the folder. AgentPat-driven tracked changes (the -agents package) come later.
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

	if (!editable) {
		return (
			<div className="h-full overflow-auto">
				<DocxEditor documentBuffer={buffer} readOnly />
			</div>
		);
	}

	return (
		<div className="h-full overflow-auto">
			<DocxEditor
				ref={editorRef}
				documentBuffer={buffer}
				onChange={() => setRev((r) => r + 1)}
				renderTitleBarRight={() => <SaveStatus status={status} />}
			/>
		</div>
	);
}
