import type { Task } from "@patrick/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SaveStatus } from "@/components/save-status";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import { useTask, useUpdateTask } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";

// The task's running record — decisions, findings, strategy. You edit it here;
// Patrick appends via saveNote. Collapsed shows a glance; expanded edits inline.
export function NotesNav() {
	const { activeTaskId } = useActiveTask();
	const { data: task } = useTask(activeTaskId);
	if (!task) return null;
	return <NotesEditor key={task.id} task={task} />;
}

function NotesEditor({ task }: { task: Task }) {
	const update = useUpdateTask();
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState(task.notes ?? "");
	const focused = useRef(false);
	const taskRef = useRef(task);
	taskRef.current = task;

	const { status } = useAutosave(value, (notes) =>
		update.mutate({ ...taskRef.current, notes }),
	);

	// Reflect external changes (Patrick's saveNote) when not mid-edit.
	useEffect(() => {
		if (!focused.current) setValue(task.notes ?? "");
	}, [task.notes]);

	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center gap-1 px-2 pb-1"
			>
				<span className="text-xs font-medium text-muted-foreground">Notes</span>
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
					<Textarea
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onFocus={() => {
							focused.current = true;
						}}
						onBlur={() => {
							focused.current = false;
						}}
						placeholder="Running record — decisions, findings, strategy. You and Patrick both add here."
						className="max-h-72 min-h-28 resize-y text-xs leading-relaxed"
					/>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="block w-full px-2 text-left"
				>
					{task.notes?.trim() ? (
						<span className="line-clamp-2 text-xs whitespace-pre-wrap text-muted-foreground/70">
							{task.notes}
						</span>
					) : (
						<span className="text-xs text-muted-foreground/40">
							No notes yet.
						</span>
					)}
				</button>
			)}
		</div>
	);
}
