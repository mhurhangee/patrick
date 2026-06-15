import { type Document, docKind } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import { EyeOff, MoreHorizontal, Plus, Star, Type } from "lucide-react";
import { type ReactNode, useState } from "react";
import { DocIcon } from "@/components/doc-icon";
import { InlineEdit } from "@/components/inline-edit";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useCreateDocument,
	useDeleteDocument,
	useExtractText,
	useRefreshDocuments,
	useRenameDocument,
	useSaveDocuments,
	useTaskDocuments,
	useUnlockDocument,
} from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";
import { type DocKind, useWorkspace } from "@/lib/workspace";
import { RetrievePublication } from "./retrieve-publication";
import { Section } from "./section";

type RowState = "closed" | "open" | "focused";

// Sort key: starred first (0), excluded last (2), everything else between (1).
const rank = (d: Document) => (d.starred ? 0 : d.excluded ? 2 : 1);

export function DocumentsNav() {
	const navigate = useNavigate();
	const { activeTaskId } = useActiveTask();
	const taskId = activeTaskId ?? "";
	const { data: documents } = useTaskDocuments(activeTaskId);
	const save = useSaveDocuments(taskId);
	const create = useCreateDocument(taskId);
	const unlock = useUnlockDocument(taskId);
	const rename = useRenameDocument(taskId);
	const del = useDeleteDocument(taskId);
	const refresh = useRefreshDocuments(taskId);
	const extract = useExtractText(taskId);
	const [extracting, setExtracting] = useState<{
		file: string;
		done: number;
		total: number;
	} | null>(null);
	const { isOpen, focused, open, close } = useWorkspace();

	// Extract a PDF's text (one at a time); progress drives the menu label.
	const extractText = (filename: string) => {
		if (extracting) return;
		setExtracting({ file: filename, done: 0, total: 0 });
		extract.mutate(
			{
				filename,
				onProgress: (done, total) =>
					setExtracting({ file: filename, done, total }),
			},
			{ onSettled: () => setExtracting(null) },
		);
	};

	const update = (filename: string, patch: Partial<Document>) =>
		save.mutate(
			(documents ?? []).map((d) =>
				d.filename === filename ? { ...d, ...patch } : d,
			),
		);

	// Opening a document takes you to the workspace to see it (e.g. from /profile).
	const openDoc = (filename: string) => {
		open(filename);
		navigate({ to: "/workspace" });
	};

	const newDocument = () =>
		create.mutate(undefined, {
			onSuccess: ({ filename }) => openDoc(filename),
		});

	const editCopy = (filename: string) =>
		unlock.mutate(filename, {
			onSuccess: ({ filename: copy }) => openDoc(copy),
		});

	const renameDoc = (from: string, to: string) =>
		rename.mutate(
			{ from, to },
			{
				// Follow the open tab to the new name so it doesn't break.
				onSuccess: ({ filename: renamed }) => {
					if (renamed !== from && isOpen(from)) {
						close(from);
						open(renamed);
					}
				},
			},
		);

	const deleteDoc = (filename: string) => {
		if (isOpen(filename)) close(filename);
		del.mutate(filename);
	};

	// Starred float to the top, excluded sink to the bottom; otherwise keep the
	// backend's alphabetical order (Array.sort is stable).
	const ordered = [...(documents ?? [])].sort((a, b) => rank(a) - rank(b));
	// Patrick-retrieved publications (full text via OPS) group on their own.
	const retrieved = ordered.filter((d) => d.retrieved);
	const ownFiles = ordered.filter((d) => !d.retrieved);

	const row = (doc: Document) => (
		<DocumentRow
			key={doc.filename}
			doc={doc}
			state={
				focused === doc.filename
					? "focused"
					: isOpen(doc.filename)
						? "open"
						: "closed"
			}
			onOpen={() => openDoc(doc.filename)}
			onUpdate={(patch) => update(doc.filename, patch)}
			onEditCopy={() => editCopy(doc.filename)}
			onRename={(to) => renameDoc(doc.filename, to)}
			onDelete={() => deleteDoc(doc.filename)}
			onExtract={() => extractText(doc.filename)}
			extracting={
				extracting?.file === doc.filename
					? { done: extracting.done, total: extracting.total }
					: null
			}
		/>
	);

	return (
		<div className="space-y-3">
			<Section
				label="Documents"
				action={<DocumentsActions onNew={newDocument} onRefresh={refresh} />}
			>
				{!documents && [0, 1, 2].map((i) => <DocumentRowSkeleton key={i} />)}
				{documents?.length === 0 && (
					<p className="px-2 py-1 text-xs text-muted-foreground">
						No documents in this task's folder.
					</p>
				)}
				{ownFiles.map(row)}
			</Section>
			<Section
				label="Retrieved documents"
				action={<RetrievePublication taskId={taskId} onRetrieved={openDoc} />}
			>
				{retrieved.length === 0 ? (
					<p className="px-2 py-1 text-xs text-muted-foreground">
						Pull a published patent (EP, WO, or US) by number.
					</p>
				) : (
					retrieved.map(row)
				)}
			</Section>
		</div>
	);
}

function DocumentsActions({
	onNew,
	onRefresh,
}: {
	onNew: () => void;
	onRefresh: () => void;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					title="Add or refresh"
					className="rounded p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
				>
					<Plus className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-52 gap-0.5 p-1">
				<MenuItem onClick={onNew}>New Word document</MenuItem>
				<MenuItem onClick={onRefresh}>Refresh folder</MenuItem>
			</PopoverContent>
		</Popover>
	);
}

function DocumentRow({
	doc,
	state,
	onOpen,
	onUpdate,
	onEditCopy,
	onRename,
	onDelete,
	onExtract,
	extracting,
}: {
	doc: Document;
	state: RowState;
	onOpen: () => void;
	onUpdate: (patch: Partial<Document>) => void;
	onEditCopy: () => void;
	onRename: (to: string) => void;
	onDelete: () => void;
	onExtract: () => void;
	extracting: { done: number; total: number } | null;
}) {
	const kind: DocKind = docKind(doc.filename);
	const [renaming, setRenaming] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	return (
		<div
			className={cn(
				"group rounded-none border-l-2 transition-colors hover:bg-sidebar-accent",
				state === "focused"
					? "border-primary bg-sidebar-accent/50"
					: state === "open"
						? "border-primary/40"
						: "border-transparent",
				doc.excluded && "opacity-55",
			)}
		>
			<div className="flex items-start gap-2 py-1 pr-1 pl-2">
				<DocIcon
					kind={kind}
					editable={kind === "docx" && !!doc.createdInPatrick}
					className="mt-0.5"
				/>
				<div className="min-w-0 flex-1">
					{renaming ? (
						<RenameField
							filename={doc.filename}
							onCommit={(to) => {
								setRenaming(false);
								if (to) onRename(to);
							}}
							onCancel={() => setRenaming(false)}
						/>
					) : (
						<button
							type="button"
							onClick={onOpen}
							className="block w-full truncate text-left text-sm leading-tight"
						>
							{doc.filename}
						</button>
					)}
					{/* Label hugs the filename; chromeless at rest, editable in place. */}
					<InlineEdit
						value={doc.label ?? ""}
						onCommit={(label) => onUpdate({ label })}
						placeholder="Add a label…"
						className="px-0 py-0.5 text-xs leading-tight text-muted-foreground"
					/>
				</div>
				{/* shrink-0 — the title truncates, these stay pinned right. */}
				<div className="flex shrink-0 items-center gap-0.5">
					{doc.contextMode === "text" && (
						<span title="Sent to Patrick as extracted text, not the PDF image">
							<Type className="size-3.5 text-emerald-600/80" />
						</span>
					)}
					{doc.starred && (
						<Star className="size-3.5 fill-current text-primary" />
					)}
					{doc.excluded && (
						<EyeOff className="size-3.5 text-muted-foreground" />
					)}
					<DocumentMenu
						doc={doc}
						kind={kind}
						onUpdate={onUpdate}
						onEditCopy={onEditCopy}
						onStartRename={() => setRenaming(true)}
						onAskDelete={() => setConfirmDelete(true)}
						onExtract={onExtract}
						extracting={extracting}
					/>
				</div>
			</div>

			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{doc.filename}"?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes the file from your task folder. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel size="default" variant="outline">
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							size="default"
							variant="destructive"
							onClick={onDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// Inline filename editor (extension fixed). Enter commits, Esc/blur cancels.
function RenameField({
	filename,
	onCommit,
	onCancel,
}: {
	filename: string;
	onCommit: (to: string) => void;
	onCancel: () => void;
}) {
	const dot = filename.lastIndexOf(".");
	const [base, setBase] = useState(dot > 0 ? filename.slice(0, dot) : filename);
	const ext = dot > 0 ? filename.slice(dot) : "";

	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: a rename field exists to be typed in
			autoFocus
			value={base}
			onChange={(e) => setBase(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") onCommit(`${base.trim()}${ext}`);
				if (e.key === "Escape") onCancel();
			}}
			onBlur={onCancel}
			className="min-w-0 flex-1 rounded-md border border-ring bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
		/>
	);
}

function DocumentMenu({
	doc,
	kind,
	onUpdate,
	onEditCopy,
	onStartRename,
	onAskDelete,
	onExtract,
	extracting,
}: {
	doc: Document;
	kind: DocKind;
	onUpdate: (patch: Partial<Document>) => void;
	onEditCopy: () => void;
	onStartRename: () => void;
	onAskDelete: () => void;
	onExtract: () => void;
	extracting: { done: number; total: number } | null;
}) {
	// Originals are the attorney's files — Patrick never renames/deletes them;
	// instead it offers an editable working copy.
	const isPatrick = !!doc.createdInPatrick;
	const canEditCopy = kind === "docx" && !isPatrick;
	const mode = doc.contextMode ?? "image";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					title="More"
					className="shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
				>
					<MoreHorizontal className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-52 gap-0.5 p-1">
				{canEditCopy && <MenuItem onClick={onEditCopy}>Edit a copy</MenuItem>}
				{kind === "pdf" && (
					<>
						<MenuItem
							onClick={onExtract}
							disabled={!!extracting}
							title="Pull selectable text out of this PDF (OCR for scans)"
						>
							{extracting
								? `Extracting… ${extracting.done}/${extracting.total || "…"}`
								: doc.extracted
									? "Re-extract text"
									: "Extract text"}
						</MenuItem>
						{doc.extracted && (
							<>
								<MenuItem
									onClick={() => onUpdate({ contextMode: "image" })}
									title="Send Patrick the original PDF (figures + layout, pricier)"
								>
									{mode === "image" ? "✓ " : ""}Context: original PDF
								</MenuItem>
								<MenuItem
									onClick={() => onUpdate({ contextMode: "text" })}
									title="Send Patrick the extracted text (cheaper, may have OCR errors)"
								>
									{mode === "text" ? "✓ " : ""}Context: extracted text
								</MenuItem>
							</>
						)}
					</>
				)}
				<MenuItem onClick={() => onUpdate({ starred: !doc.starred })}>
					{doc.starred ? "Unstar" : "Star"}
				</MenuItem>
				<MenuItem onClick={() => onUpdate({ excluded: !doc.excluded })}>
					{doc.excluded ? "Include for Patrick" : "Exclude from Patrick"}
				</MenuItem>
				{isPatrick && (
					<>
						<MenuItem onClick={onStartRename}>Rename</MenuItem>
						<MenuItem destructive onClick={onAskDelete}>
							Delete
						</MenuItem>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}

function MenuItem({
	children,
	onClick,
	destructive,
	disabled,
	title,
}: {
	children: ReactNode;
	onClick?: () => void;
	destructive?: boolean;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={cn(
				"flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-40",
				destructive && "text-destructive",
			)}
		>
			{children}
		</button>
	);
}

function DocumentRowSkeleton() {
	return (
		<div className="flex items-start gap-2 py-1 pr-1 pl-2">
			<Skeleton className="mt-0.5 size-4 rounded-sm" />
			<div className="min-w-0 flex-1 space-y-1.5 py-0.5">
				<Skeleton className="h-3.5 w-32" />
				<Skeleton className="h-3 w-20" />
			</div>
		</div>
	);
}
