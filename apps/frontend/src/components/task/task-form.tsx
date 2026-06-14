import { type Task, taskDisplayName } from "@patrick/shared";
import { useState } from "react";
import { Hint } from "@/components/hint";
import { SaveStatus } from "@/components/save-status";
import {
	DangerZone,
	SettingsBody,
	SettingsFallbackHeading,
	SettingsRail,
	SettingsRailHeading,
	SettingsSection,
	type SettingsSectionDef,
} from "@/components/settings/settings";
import { DocumentsSection } from "@/components/task/documents-section";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";

const SECTIONS: readonly SettingsSectionDef[] = [
	{ id: "details", label: "Details" },
	{ id: "documents", label: "Documents" },
	{ id: "notes", label: "Notes" },
];

/**
 * Task settings as a settings surface, mirroring the profile editor: details
 * (name + brief), documents, notes, and a danger zone. Mount with `key={task.id}`
 * so switching tasks resets the draft; everything auto-saves (debounced).
 */
export function TaskForm({
	task,
	onSave,
	saving,
	onDelete,
}: {
	task: Task;
	onSave: (task: Task) => void;
	saving?: boolean;
	onDelete?: () => void | Promise<void>;
}) {
	const [draft, setDraft] = useState(task);
	const { status: autoStatus, cancel } = useAutosave(draft, onSave);
	const status = saving ? "saving" : autoStatus;

	return (
		<div className="@container mx-auto max-w-4xl px-8 py-10">
			<SettingsFallbackHeading
				title="Edit task"
				subtitle={`${taskDisplayName(draft)} · ${draft.folder}`}
				status={status}
			/>

			<SettingsBody
				rail={
					<SettingsRail
						items={SECTIONS}
						hasDanger={!!onDelete}
						header={
							<SettingsRailHeading
								title="Edit task"
								name={taskDisplayName(draft)}
								detail={draft.folder}
							/>
						}
						footer={<SaveStatus status={status} />}
					/>
				}
			>
				<SettingsSection id="details" title="Details">
					<Hint className="mb-6" title="Patrick can help">
						Ask in the chat — Patrick can draft the brief, label the documents,
						or add to your notes.
					</Hint>
					<div className="space-y-6">
						<Field>
							<FieldLabel htmlFor="task-name">Name</FieldLabel>
							<Input
								id="task-name"
								value={draft.name ?? ""}
								placeholder="US 17/123,456 — NFOA response"
								onChange={(e) =>
									setDraft((d) => ({ ...d, name: e.target.value }))
								}
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
								onChange={(e) =>
									setDraft((d) => ({ ...d, label: e.target.value }))
								}
							/>
							<FieldDescription>
								The objective — what this task is, the way you'd brief a
								colleague. It frames everything Patrick does (the {"<TASK>"}{" "}
								token).
							</FieldDescription>
						</Field>
					</div>
				</SettingsSection>

				<SettingsSection id="documents" title="Documents">
					<DocumentsSection taskId={draft.id} />
				</SettingsSection>

				<SettingsSection
					id="notes"
					title="Notes"
					description="A running record of decisions, findings, and strategy — you and Patrick both add here. Fed to Patrick as part of the task."
				>
					<Textarea
						value={draft.notes ?? ""}
						placeholder="Running record — decisions, findings, strategy."
						className="min-h-32"
						onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
					/>
				</SettingsSection>

				{onDelete && (
					<DangerZone
						title="Delete task"
						description="Removes the task from Patrick. The folder on disk, its documents, and your files are untouched."
						onConfirm={() => {
							cancel();
							return onDelete();
						}}
					/>
				)}
			</SettingsBody>
		</div>
	);
}
