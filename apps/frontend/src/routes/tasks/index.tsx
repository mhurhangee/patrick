import { taskDisplayName } from "@patrick/shared";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FolderOpen, Plus, X } from "lucide-react";
import { useState } from "react";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateTask, useTasks } from "@/hooks/use-tasks";
import { getStoredProfileId } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";

export const Route = createFileRoute("/tasks/")({
	beforeLoad: () => {
		if (!getStoredProfileId()) throw redirect({ to: "/profiles" });
	},
	component: TasksPicker,
});

function TasksPicker() {
	const navigate = useNavigate();
	const { activeTaskId, setActiveTaskId } = useActiveTask();
	const { data: tasks, isLoading } = useTasks();
	const create = useCreateTask();
	const [adding, setAdding] = useState(false);
	const [folder, setFolder] = useState("");

	const open = (id: string) => {
		setActiveTaskId(id);
		navigate({ to: "/tasks/$id", params: { id } });
	};

	const createFromFolder = () => {
		const path = folder.trim();
		if (!path) return;
		create.mutate(path, {
			onSuccess: (task) => {
				setFolder("");
				setAdding(false);
				open(task.id);
			},
		});
	};

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
				<div className="flex h-8 items-center justify-between">
					<Button asChild variant="ghost" size="sm" className="-ml-2">
						<Link to="/profiles">
							<ArrowLeft />
							Profiles
						</Link>
					</Button>
					{activeTaskId && (
						<Button asChild variant="ghost" size="sm">
							<Link to="/workspace">
								Workspace
								<ArrowRight />
							</Link>
						</Button>
					)}
				</div>

				<div className="flex items-center gap-3">
					<Patrick size={32} />
					<div>
						<h1>Tasks</h1>
						<p className="text-sm text-muted-foreground">
							Open a folder as a task, or pick up where you left off.
						</p>
					</div>
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					{isLoading
						? [0, 1].map((i) => (
								<Skeleton key={i} className="h-20 rounded-lg" />
							))
						: tasks?.map((t) => (
								<button
									type="button"
									key={t.id}
									onClick={() => open(t.id)}
									className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
								>
									<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
										<FolderOpen className="size-5" />
									</span>
									<div className="min-w-0 flex-1">
										<div className="truncate font-medium">
											{taskDisplayName(t)}
										</div>
										<div className="truncate text-sm text-muted-foreground">
											{t.folder}
										</div>
									</div>
								</button>
							))}

					{adding ? (
						<div className="space-y-1.5 rounded-lg border border-dashed p-3 sm:col-span-2">
							<div className="flex gap-2">
								<Input
									autoFocus
									value={folder}
									placeholder="/path/to/the/matter/folder"
									onChange={(e) => setFolder(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") createFromFolder();
										if (e.key === "Escape") setAdding(false);
									}}
								/>
								<Button
									onClick={createFromFolder}
									disabled={!folder.trim() || create.isPending}
								>
									<FolderOpen />
									{create.isPending ? "Opening…" : "Open"}
								</Button>
								<Button
									variant="ghost"
									size="icon"
									title="Cancel"
									onClick={() => {
										setAdding(false);
										setFolder("");
									}}
								>
									<X />
								</Button>
							</div>
							{create.isError && (
								<p className="text-xs text-destructive">
									{String(create.error).includes("400")
										? "Folder not found on disk — check the path."
										: "Couldn't open that folder."}
								</p>
							)}
						</div>
					) : (
						<button
							type="button"
							onClick={() => setAdding(true)}
							className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<Plus className="size-4" />
							New task
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
