import {
	type Document,
	type Task,
	type TaskSummary,
	toDocumentMeta,
} from "@patrick/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/api/tasks";

const keys = {
	list: ["tasks"] as const,
	one: (id: string) => ["tasks", id] as const,
	documents: (id: string) => ["tasks", id, "documents"] as const,
};

export function useTasks() {
	return useQuery({ queryKey: keys.list, queryFn: tasksApi.list });
}

export function useTask(id: string | undefined) {
	return useQuery({
		queryKey: keys.one(id ?? ""),
		queryFn: () => tasksApi.get(id as string),
		enabled: !!id,
	});
}

export function useCreateTask() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (folder: string) => tasksApi.create(folder),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.list }),
	});
}

export function useUpdateTask() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (task: Task) => tasksApi.update(task),
		onSuccess: (saved) => {
			qc.setQueryData(keys.one(saved.id), saved);
			qc.invalidateQueries({ queryKey: keys.list });
		},
	});
}

export function useDeleteTask() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => tasksApi.remove(id),
		// Optimistic: drop it from the list now so leaving is instant.
		onMutate: async (id) => {
			await qc.cancelQueries({ queryKey: keys.list });
			const prev = qc.getQueryData<TaskSummary[]>(keys.list);
			qc.setQueryData<TaskSummary[]>(keys.list, (xs) =>
				xs?.filter((t) => t.id !== id),
			);
			return { prev };
		},
		onError: (_e, _id, ctx) => {
			if (ctx?.prev) qc.setQueryData(keys.list, ctx.prev);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: keys.list }),
	});
}

export function useTaskDocuments(id: string | undefined) {
	return useQuery({
		queryKey: keys.documents(id ?? ""),
		queryFn: () => tasksApi.documents(id as string),
		enabled: !!id,
	});
}

export function useSaveDocuments(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (docs: Document[]) =>
			tasksApi.saveDocuments(id, toDocumentMeta(docs)),
		// Optimistic so toggles/labels feel instant and survive navigation.
		onMutate: async (docs) => {
			await qc.cancelQueries({ queryKey: keys.documents(id) });
			const prev = qc.getQueryData<Document[]>(keys.documents(id));
			qc.setQueryData(keys.documents(id), docs);
			return { prev };
		},
		onError: (_e, _docs, ctx) => {
			if (ctx?.prev) qc.setQueryData(keys.documents(id), ctx.prev);
		},
	});
}
