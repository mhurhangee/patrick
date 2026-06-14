import { type Task, taskDisplayName } from "@patrick/shared";
import { Hint } from "@/components/hint";
import { RichEditor } from "@/components/rich-editor/rich-editor";
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
import { useAutosavedDraft } from "@/hooks/use-autosave";

const SECTIONS: readonly SettingsSectionDef[] = [
	{ id: "details", label: "Details" },
	{ id: "brief", label: "Brief" },
	{ id: "documents", label: "Documents" },
];

/**
 * Task settings as a settings surface, mirroring the profile editor: details
 * (name), the living brief, documents, and a danger zone. Mount with `key={task.id}`
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
	// A draft that auto-saves and adopts Patrick's external edits (e.g. a brief
	// suggestion accepted from the chat) without clobbering in-flight typing.
	const {
		draft,
		setDraft,
		status: autoStatus,
		cancel,
	} = useAutosavedDraft(task, onSave);
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
						or keep the brief current.
					</Hint>
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
				</SettingsSection>

				<SettingsSection
					id="brief"
					title="Brief"
					description="What this matter is and what you're trying to achieve — a living record you and Patrick both keep current. Injected into every chat."
				>
					<RichEditor
						value={draft.brief}
						onChange={(brief) => setDraft((d) => ({ ...d, brief }))}
						features={{ headings: true, lists: true }}
						placeholder="Respond to the Non-Final OA on US 17/123,456 — claims 1–20 rejected under §103 over Smith in view of Jones. Capture key dates, strategy, and decisions as they come up."
						className="min-h-40 rounded-md border p-3 leading-relaxed"
					/>
				</SettingsSection>

				<SettingsSection id="documents" title="Documents">
					<DocumentsSection taskId={draft.id} />
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
