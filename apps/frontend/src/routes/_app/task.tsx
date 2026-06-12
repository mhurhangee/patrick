import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TaskForm } from "@/components/task/task-form";
import { Skeleton } from "@/components/ui/skeleton";
import { SurfaceScaffold } from "@/components/workspace/surface-scaffold";
import { useDeleteTask, useTask, useUpdateTask } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";

export const Route = createFileRoute("/_app/task")({
	component: TaskSettingsSurface,
});

// Task settings as an in-panel surface — edits the active task. Documents and
// notes live in the sidebar; this is name, the brief, and the danger zone.
function TaskSettingsSurface() {
	const navigate = useNavigate();
	const { activeTaskId, setActiveTaskId } = useActiveTask();
	const { data: task, isLoading } = useTask(activeTaskId);
	const update = useUpdateTask();
	const del = useDeleteTask();

	// Delete clears to the empty state (open a folder) rather than silently
	// switching to another task.
	const deleteTask = async () => {
		if (!activeTaskId) return;
		await del.mutateAsync(activeTaskId);
		setActiveTaskId(undefined);
		navigate({ to: "/workspace" });
	};

	return (
		<SurfaceScaffold>
			{isLoading || !task ? (
				<div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
					<Skeleton className="h-9 w-72" />
					<Skeleton className="h-28 w-full" />
				</div>
			) : (
				<TaskForm
					key={task.id}
					task={task}
					saving={update.isPending}
					onSave={(next) => update.mutate(next)}
					onDelete={deleteTask}
				/>
			)}
		</SurfaceScaffold>
	);
}
