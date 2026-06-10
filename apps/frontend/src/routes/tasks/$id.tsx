import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { TaskForm } from "@/components/task/task-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteTask, useTask, useUpdateTask } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";

export const Route = createFileRoute("/tasks/$id")({
	component: TaskSetup,
});

function TaskSetup() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { setActiveTaskId } = useActiveTask();
	const { data: task, isLoading } = useTask(id);
	const update = useUpdateTask();
	const del = useDeleteTask();

	// Opening a task here makes it the active one.
	useEffect(() => setActiveTaskId(id), [id, setActiveTaskId]);

	const deleteTask = async () => {
		await del.mutateAsync(id);
		setActiveTaskId(undefined);
		navigate({ to: "/tasks" });
	};

	const back = (
		<Button asChild variant="ghost" size="sm" className="-ml-2">
			<Link to="/tasks">
				<ArrowLeft />
				Tasks
			</Link>
		</Button>
	);

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto max-w-3xl space-y-6 p-8">
				{isLoading || !task ? (
					<div className="space-y-4">
						{back}
						<Skeleton className="h-9 w-72" />
						<Skeleton className="h-24 w-full" />
					</div>
				) : (
					<TaskForm
						key={task.id}
						task={task}
						nav={back}
						saving={update.isPending}
						onSave={(next) => update.mutate(next)}
						onDelete={deleteTask}
						primaryAction={{
							label: "Continue to workspace →",
							onClick: () => navigate({ to: "/workspace" }),
						}}
					/>
				)}
			</div>
		</div>
	);
}
