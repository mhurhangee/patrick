import type { Task } from "@patrick/shared";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { RichEditor } from "@/components/rich-editor/rich-editor";
import { SaveStatus } from "@/components/save-status";
import { useAutosavedDraft } from "@/hooks/use-autosave";
import { useTask, useUpdateTask } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";

// The task's living brief — what the matter is, the objective, and the running
// record. You edit it here; Patrick proposes edits via suggestBrief (replace or
// append). Collapsed shows a glance; expanded edits inline.
export function NotesNav() {
	const { activeTaskId } = useActiveTask();
	const { data: task } = useTask(activeTaskId);
	if (!task) return null;
	return <BriefEditor key={task.id} task={task} />;
}

function BriefEditor({ task }: { task: Task }) {
	const update = useUpdateTask();
	const [open, setOpen] = useState(false);
	// Edits the whole task (brief field); auto-saves and adopts Patrick's external
	// brief edits without clobbering in-flight typing.
	const { draft, setDraft, status } = useAutosavedDraft(task, (t) =>
		update.mutate(t),
	);

	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center gap-1 px-2 pb-1"
			>
				<span className="text-xs font-medium text-muted-foreground">Brief</span>
				{open && <SaveStatus status={status} />}
				<ChevronDown
					className={cn(
						"ml-auto size-3.5 text-muted-foreground/60 transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{open ? (
				<div className="px-1">
					<RichEditor
						value={draft.brief}
						onChange={(brief) => setDraft((d) => ({ ...d, brief }))}
						features={{ headings: true, lists: true }}
						placeholder="What this matter is and what you're trying to achieve — kept current as it develops. You and Patrick both add here."
						className="max-h-72 min-h-28 overflow-y-auto rounded-md border p-2 text-xs leading-relaxed"
					/>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="block w-full px-2 text-left"
				>
					{draft.brief?.trim() ? (
						<span className="line-clamp-2 text-xs whitespace-pre-wrap text-muted-foreground/70">
							{draft.brief}
						</span>
					) : (
						<span className="text-xs text-muted-foreground/40">
							No brief yet.
						</span>
					)}
				</button>
			)}
		</div>
	);
}
