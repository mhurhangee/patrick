import type {
	Document,
	DocumentMeta,
	Task,
	TaskSummary,
} from "@patrick/shared";
import { api } from "./client";

export const tasksApi = {
	list: () => api.get<TaskSummary[]>("/tasks"),
	get: (id: string) => api.get<Task>(`/tasks/${id}`),
	create: (folder: string) => api.post<Task>("/tasks", { folder }),
	update: (task: Task) => api.put<Task>(`/tasks/${task.id}`, task),
	remove: (id: string) => api.del<{ ok: boolean }>(`/tasks/${id}`),
	documents: (id: string) => api.get<Document[]>(`/tasks/${id}/documents`),
	saveDocuments: (id: string, meta: DocumentMeta) =>
		api.put<{ ok: boolean }>(`/tasks/${id}/documents`, meta),
};
