import { taskDisplayName } from "@patrick/shared";
import { Link } from "@tanstack/react-router";
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useTask, useTasks } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";

export function TaskSwitcher() {
	const { activeTaskId, setActiveTaskId } = useActiveTask();
	const { data: task } = useTask(activeTaskId);
	const { data: tasks } = useTasks();
	const [open, setOpen] = useState(false);

	const loadingActive = !!activeTaskId && !task;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
				>
					<div className="min-w-0 flex-1">
						{loadingActive ? (
							<div className="space-y-1.5 py-0.5">
								<Skeleton className="h-3.5 w-28" />
								<Skeleton className="h-3 w-40" />
							</div>
						) : (
							<>
								<div className="truncate text-sm font-medium">
									{task ? taskDisplayName(task) : "No task"}
								</div>
								<div className="truncate text-xs text-muted-foreground">
									{task?.folder}
								</div>
							</>
						)}
					</div>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 gap-0.5 p-1">
				{!tasks &&
					[0, 1, 2].map((i) => (
						<div key={i} className="flex flex-col gap-1.5 px-2 py-1.5">
							<Skeleton className="h-3.5 w-32" />
							<Skeleton className="h-3 w-44" />
						</div>
					))}
				{tasks?.map((t) => (
					<button
						type="button"
						key={t.id}
						onClick={() => {
							setActiveTaskId(t.id);
							setOpen(false);
						}}
						className={cn(
							"flex w-full flex-col rounded-sm px-2 py-1 text-left hover:bg-accent",
							t.id === activeTaskId && "bg-accent",
						)}
					>
						<span className="truncate text-sm">{taskDisplayName(t)}</span>
						<span className="truncate text-xs text-muted-foreground">
							{t.folder}
						</span>
					</button>
				))}
				<Separator className="my-0.5" />
				<Button
					asChild
					variant="ghost"
					size="sm"
					className="w-full justify-start"
				>
					<Link to="/tasks">All tasks…</Link>
				</Button>
			</PopoverContent>
		</Popover>
	);
}
