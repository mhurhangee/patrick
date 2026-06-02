import type { ApiTask, TaskType } from "@patrickos/shared"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export function useTaskState() {
	const [tasks, setTasks] = useState<ApiTask[]>([])
	const [tasksLoading, setTasksLoading] = useState(true)
	const [currentTaskId, setCurrentTaskId] = useState("")

	useEffect(() => {
		api.tasks
			.list()
			.then((data) => {
				setTasks(data)
				if (data.length > 0) setCurrentTaskId(data[0].path)
			})
			.finally(() => setTasksLoading(false))
	}, [])

	async function createTask(path: string, name?: string, taskType?: TaskType) {
		const task = await api.tasks.create(path, name, taskType)
		setTasks((prev) => [...prev, task])
		setCurrentTaskId(task.path)
		return task
	}

	async function renameTask(path: string, name: string) {
		const updated = await api.tasks.rename(path, name)
		setTasks((prev) => prev.map((p) => (p.path === path ? updated : p)))
		return updated
	}

	async function deleteTask(path: string) {
		await api.tasks.delete(path)
		setTasks((prev) => {
			const next = prev.filter((p) => p.path !== path)
			if (currentTaskId === path) setCurrentTaskId(next[0]?.path ?? "")
			return next
		})
	}

	return {
		tasks,
		tasksLoading,
		currentTaskId,
		setCurrentTaskId,
		createTask,
		renameTask,
		deleteTask,
	}
}
