import { type Task, taskDisplayName } from "@patrick/shared";
import { type ReactNode, useState } from "react";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SaveStatus } from "@/components/save-status";
import { DocumentsSection } from "@/components/task/documents-section";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";

/**
 * Task editor. Mount with `key={task.id}` so switching tasks resets the draft.
 * The label + document labels auto-save; `primaryAction` (Continue) flushes
 * the task label before running (documents save on their own debounce).
 */
export function TaskForm({
	task,
	onSave,
	saving,
	nav,
	primaryAction,
	onDelete,
}: {
	task: Task;
	onSave: (task: Task) => void;
	saving?: boolean;
	nav?: ReactNode;
	primaryAction?: { label: string; onClick: () => void };
	onDelete?: () => void | Promise<void>;
}) {
	const [draft, setDraft] = useState(task);
	const { status: autoStatus, flush, cancel } = useAutosave(draft, onSave);
	const status = saving ? "saving" : autoStatus;

	return (
		<div className="space-y-6">
			<div className="space-y-3">
				{nav}
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h1 className="truncate">{taskDisplayName(draft)}</h1>
						<p className="truncate text-sm text-muted-foreground">
							{draft.folder}
						</p>
					</div>
					<SaveStatus status={status} />
				</div>
			</div>

			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="task-name">Name</FieldLabel>
					<Input
						id="task-name"
						value={draft.name ?? ""}
						placeholder="US 17/123,456 — NFOA response"
						onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
					/>
					<FieldDescription>
						A short name for this task, shown in the sidebar.
					</FieldDescription>
				</Field>

				<Field>
					<FieldLabel htmlFor="task-label">Brief</FieldLabel>
					<Textarea
						id="task-label"
						value={draft.label}
						placeholder="Respond to the Non-Final OA on US 17/123,456 — claims 1–20 rejected under §103 over Smith in view of Jones."
						className="min-h-20"
						onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
					/>
					<FieldDescription>
						The objective — what this task is, the way you'd brief a colleague.
						Set once; it frames everything Patrick does (the {"<TASK>"} token).
						The running record (decisions, findings) lives in Notes, in the
						workspace sidebar.
					</FieldDescription>
				</Field>
			</FieldGroup>

			<Separator />

			<DocumentsSection taskId={draft.id} />

			{(onDelete || primaryAction) && (
				<div className="flex items-center justify-between gap-3">
					{onDelete ? (
						<ConfirmDelete
							label="Delete task"
							title="Delete this task?"
							description="This removes the task from Patrick. The folder on disk and its documents are untouched."
							onConfirm={() => {
								cancel();
								return onDelete();
							}}
						/>
					) : (
						<span />
					)}
					{primaryAction && (
						<Button
							onClick={() => {
								flush();
								primaryAction.onClick();
							}}
						>
							{primaryAction.label}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
