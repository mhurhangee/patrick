import { taskDisplayName } from "@patrick/shared";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, FolderOpen, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useNewTask } from "@/hooks/use-create-flows";
import { useTask, useTasks } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";
import { isTauri } from "@/lib/desktop";
import { cn } from "@/lib/utils";

export function TaskSwitcher() {
	const navigate = useNavigate();
	const { activeTaskId, setActiveTaskId } = useActiveTask();
	const { data: task } = useTask(activeTaskId);
	const { data: tasks } = useTasks();
	const { pickAndCreate, newTaskFromFolder } = useNewTask();
	const onSettings = useLocation({ select: (l) => l.pathname === "/task" });

	const loadingActive = !!activeTaskId && !task;

	// Desktop opens the native picker; the browser falls back to a typed path.
	const openFolder = () => {
		if (isTauri()) {
			pickAndCreate();
			return;
		}
		const path = window.prompt("Folder path");
		if (path) newTaskFromFolder(path);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="row" aria-current={onSettings || undefined}>
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
									{task?.folder ?? "Open a folder to start"}
								</div>
							</>
						)}
					</div>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel>Tasks</DropdownMenuLabel>
				{!tasks &&
					[0, 1].map((i) => (
						<div key={i} className="px-2 py-1.5">
							<Skeleton className="h-3.5 w-32" />
						</div>
					))}
				{tasks?.map((t) => (
					<DropdownMenuItem
						key={t.id}
						onSelect={() => setActiveTaskId(t.id)}
						className="gap-2"
					>
						<Check
							className={cn(
								"size-3.5",
								t.id === activeTaskId ? "opacity-100" : "opacity-0",
							)}
						/>
						<div className="min-w-0 flex-1">
							<div className="truncate">{taskDisplayName(t)}</div>
							<div className="truncate text-[0.625rem] text-muted-foreground">
								{t.folder}
							</div>
						</div>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={openFolder}>
					<FolderOpen />
					Open a folder…
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/task" })}
					disabled={!activeTaskId}
				>
					<Settings2 />
					Task settings
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
