import { DocxEditor } from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-react/styles.css";
import { useEffect, useState } from "react";
import { tasksApi } from "@/api/tasks";
import { useActiveTask } from "@/lib/active-task";

/**
 * Read-only .docx rendering via @eigenpal/docx-editor (ProseMirror). `readOnly`
 * strips the toolbar + editing UI — viewing only for now; AgentPat-driven
 * tracked changes (the -agents package) come later.
 */
export function DocxViewer({ filename }: { filename: string }) {
	const { activeTaskId } = useActiveTask();
	const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
	const [error, setError] = useState(false);

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

	return (
		<div className="h-full overflow-auto">
			<DocxEditor documentBuffer={buffer} readOnly />
		</div>
	);
}
