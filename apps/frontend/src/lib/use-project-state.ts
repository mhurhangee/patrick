import type { ApiProject, ProjectType } from "@patrickos/db"
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
				if (data.length > 0) setCurrentProjectId(data[0].id)
			})
			.finally(() => setProjectsLoading(false))
	}, [])

	async function createProject(name: string, type: ProjectType) {
		const project = await api.projects.create(name, type)
		setProjects((prev) => [...prev, project])
		setCurrentProjectId(project.id)
		return project
	}

	async function updateProject(
		id: string,
		patch: { name?: string; type?: ProjectType },
	) {
		const updated = await api.projects.update(id, patch)
		setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)))
		return updated
	}

	async function deleteProject(id: string) {
		await api.projects.delete(id)
		setProjects((prev) => {
			const next = prev.filter((p) => p.id !== id)
			if (currentProjectId === id) setCurrentProjectId(next[0]?.id ?? "")
			return next
		})
	}

	return {
		projects,
		projectsLoading,
		currentProjectId,
		setCurrentProjectId,
		createProject,
		updateProject,
		deleteProject,
	}
}
