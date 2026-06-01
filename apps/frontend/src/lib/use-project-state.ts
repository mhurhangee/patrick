import type { ApiProject } from "@patrickos/shared"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export function useProjectState() {
	const [projects, setProjects] = useState<ApiProject[]>([])
	const [projectsLoading, setProjectsLoading] = useState(true)
	const [currentProjectId, setCurrentProjectId] = useState("")

	useEffect(() => {
		api.projects
			.list()
			.then((data) => {
				setProjects(data)
				if (data.length > 0) setCurrentProjectId(data[0].path)
			})
			.finally(() => setProjectsLoading(false))
	}, [])

	async function createProject(path: string, name?: string) {
		const project = await api.projects.create(path, name)
		setProjects((prev) => [...prev, project])
		setCurrentProjectId(project.path)
		return project
	}

	async function renameProject(path: string, name: string) {
		const updated = await api.projects.rename(path, name)
		setProjects((prev) => prev.map((p) => (p.path === path ? updated : p)))
		return updated
	}

	async function deleteProject(path: string) {
		await api.projects.delete(path)
		setProjects((prev) => {
			const next = prev.filter((p) => p.path !== path)
			if (currentProjectId === path) setCurrentProjectId(next[0]?.path ?? "")
			return next
		})
	}

	return {
		projects,
		projectsLoading,
		currentProjectId,
		setCurrentProjectId,
		createProject,
		renameProject,
		deleteProject,
	}
}
