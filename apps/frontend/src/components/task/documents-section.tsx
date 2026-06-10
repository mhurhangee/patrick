import type { Document } from "@patrick/shared";
import { EyeOff, Star } from "lucide-react";
import { useState } from "react";
import { DocIcon } from "@/components/doc-icon";
import { InlineEdit } from "@/components/inline-edit";
import { SaveStatus } from "@/components/save-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutosave } from "@/hooks/use-autosave";
import { useSaveDocuments, useTaskDocuments } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";

export function DocumentsSection({ taskId }: { taskId: string }) {
	const { data: docs, isLoading } = useTaskDocuments(taskId);

	if (isLoading) {
		return <Skeleton className="h-20 w-full" />;
	}
	if (!docs) return null;
	// Key by taskId so the editor's initial state resets when the task changes.
	return <DocumentsEditor key={taskId} taskId={taskId} initial={docs} />;
}

function DocumentsEditor({
	taskId,
	initial,
}: {
	taskId: string;
	initial: Document[];
}) {
	const save = useSaveDocuments(taskId);
	const [items, setItems] = useState(initial);
	const { status: autoStatus } = useAutosave(items, (list) =>
		save.mutate(list),
	);
	const status = save.isPending ? "saving" : autoStatus;

	const update = (filename: string, patch: Partial<Document>) =>
		setItems((xs) =>
			xs.map((d) => (d.filename === filename ? { ...d, ...patch } : d)),
		);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-sm font-medium">Documents</h2>
					<p className="text-xs text-muted-foreground">
						Click a label to tell Patrick what each document is. Exclude
						anything it shouldn't read.
					</p>
				</div>
				<SaveStatus status={status} />
			</div>

			{items.length === 0 ? (
				<p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
					No PDF or Word documents found in this folder.
				</p>
			) : (
				<div className="divide-y rounded-md border">
					{items.map((doc) => (
						<div
							key={doc.filename}
							className={cn(
								"flex items-center gap-3 px-3 py-2",
								doc.excluded && "opacity-55",
							)}
						>
							<DocIcon
								kind={
									doc.filename.toLowerCase().endsWith(".pdf") ? "pdf" : "docx"
								}
								editable={!!doc.createdInPatrick}
							/>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">
									{doc.filename}
								</div>
								<InlineEdit
									value={doc.label ?? ""}
									onCommit={(label) => update(doc.filename, { label })}
									placeholder="Add a label…"
									className="text-xs"
								/>
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="size-7 shrink-0"
								title={doc.starred ? "Unstar" : "Star"}
								onClick={() => update(doc.filename, { starred: !doc.starred })}
							>
								<Star
									className={cn(
										"size-4",
										doc.starred
											? "fill-amber-400 text-amber-500"
											: "text-muted-foreground",
									)}
								/>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="size-7 shrink-0"
								title={
									doc.excluded ? "Include for Patrick" : "Exclude from Patrick"
								}
								onClick={() =>
									update(doc.filename, { excluded: !doc.excluded })
								}
							>
								<EyeOff
									className={cn(
										"size-4",
										doc.excluded ? "text-amber-500" : "text-muted-foreground",
									)}
								/>
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
