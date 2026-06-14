import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Task, type TaskSummary, taskSummary } from "@patrick/shared";
import { parse, stringify } from "yaml";
import { taskPath, tasksDir } from "./config";

export async function listTasks(): Promise<TaskSummary[]> {
	let ids: string[];
	try {
		ids = await readdir(tasksDir());
	} catch {
		return [];
	}
	const summaries: TaskSummary[] = [];
	for (const id of ids) {
		const task = await readTask(id);
		if (task) summaries.push(taskSummary(task));
	}
	return summaries;
}

export async function readTask(id: string): Promise<Task | null> {
	try {
		const task = parse(await readFile(taskPath(id), "utf8")) as Task;
		// `brief` is required downstream (the editor + prompt); default it so a task
		// file written before the field existed doesn't read back as undefined.
		return { ...task, brief: task.brief ?? "" };
	} catch {
		return null;
	}
}

export async function writeTask(task: Task): Promise<void> {
	const path = taskPath(task.id);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, stringify(task), "utf8");
}

/** Remove the task from the registry. Never touches the attorney's folder. */
export async function deleteTask(id: string): Promise<void> {
	await rm(dirname(taskPath(id)), { recursive: true, force: true });
}
