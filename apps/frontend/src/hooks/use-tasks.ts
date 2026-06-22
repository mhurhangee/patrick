import {
	type Document,
	type Task,
	type TaskSummary,
	toDocumentMeta,
} from "@patrick/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/api/tasks";
import { extractText } from "@/lib/extract-text";
import { clearDocIndex } from "@/lib/search/doc-index";

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

/** Re-scan the task folder (picks up files added/removed outside Patrick). */
export function useRefreshDocuments(id: string) {
	const qc = useQueryClient();
	return () => {
		void qc.invalidateQueries({ queryKey: keys.documents(id) });
	};
}

export function useCreateDocument(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (filename?: string) => tasksApi.createDocument(id, filename),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.documents(id) }),
	});
}

export function useUnlockDocument(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (filename: string) => tasksApi.unlockDocument(id, filename),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.documents(id) }),
	});
}

export function useGenerateLabel(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			filename,
			profileId,
		}: {
			filename: string;
			profileId: string;
		}) => tasksApi.generateLabel(id, filename, profileId),
		// Write the result straight into the cache (the server already persisted it
		// via mergeDocumentMeta). Merging in place — rather than invalidating and
		// racing a refetch — means an optimistic document-save that snapshots the
		// cache can't clobber the just-generated label + suggestions.
		onSuccess: ({ label, suggestions }, { filename }) => {
			qc.setQueryData<Document[]>(keys.documents(id), (docs) =>
				docs?.map((d) =>
					d.filename === filename ? { ...d, label, suggestions } : d,
				),
			);
		},
	});
}

export function useFetchPublication(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			number,
			profileId,
		}: {
			number: string;
			profileId: string;
		}) => tasksApi.fetchPublication(id, number, profileId),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.documents(id) }),
	});
}

// Extract a PDF's text (text layer or OCR) in the browser, then persist it.
// Progress (page x/n) is reported via the caller's onProgress.
export function useExtractText(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({
			filename,
			onProgress,
		}: {
			filename: string;
			onProgress?: (done: number, total: number) => void;
		}) => {
			const doc = await extractText(id, filename, onProgress);
			await tasksApi.saveExtractedText(id, filename, doc);
			// The session index cache is content-blind — drop it so search rebuilds
			// against the freshly extracted text.
			clearDocIndex(id, filename);
			return doc;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.documents(id) }),
	});
}

export function useRenameDocument(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ from, to }: { from: string; to: string }) =>
			tasksApi.renameDocument(id, from, to),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.documents(id) }),
	});
}

export function useDeleteDocument(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (filename: string) => tasksApi.removeDocument(id, filename),
		// Optimistic: drop it from the list immediately.
		onMutate: async (filename) => {
			await qc.cancelQueries({ queryKey: keys.documents(id) });
			const prev = qc.getQueryData<Document[]>(keys.documents(id));
			qc.setQueryData<Document[]>(keys.documents(id), (xs) =>
				xs?.filter((d) => d.filename !== filename),
			);
			return { prev };
		},
		onError: (_e, _filename, ctx) => {
			if (ctx?.prev) qc.setQueryData(keys.documents(id), ctx.prev);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: keys.documents(id) }),
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
