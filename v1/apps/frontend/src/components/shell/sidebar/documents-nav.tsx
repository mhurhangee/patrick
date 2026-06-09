import type { Document } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import { EyeOff, FileText, MoreHorizontal, Plus, Star } from "lucide-react";
import { type ReactNode, useState } from "react";
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
import {
	useCreateDocument,
	useDeleteDocument,
	useRefreshDocuments,
	useRenameDocument,
	useSaveDocuments,
	useTaskDocuments,
	useUnlockDocument,
} from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";
import { type DocKind, useWorkspace } from "@/lib/workspace";
import { Section } from "./section";

type RowState = "closed" | "open" | "focused";

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
	const { isOpen, focused, open, close } = useWorkspace();

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

	return (
		<Section
			label="Documents"
			action={<DocumentsActions onNew={newDocument} onRefresh={refresh} />}
		>
			{documents?.length === 0 && (
				<p className="px-2 py-1 text-xs text-muted-foreground">
					No documents in this task's folder.
				</p>
			)}
			{documents?.map((doc) => (
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
				/>
			))}
		</Section>
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
}: {
	doc: Document;
	state: RowState;
	onOpen: () => void;
	onUpdate: (patch: Partial<Document>) => void;
	onEditCopy: () => void;
	onRename: (to: string) => void;
	onDelete: () => void;
}) {
	const kind: DocKind = doc.filename.toLowerCase().endsWith(".pdf")
		? "pdf"
		: "docx";
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
			<div className="flex items-center pr-1">
				{renaming ? (
					<div className="flex min-w-0 flex-1 items-center gap-2 py-0.5 pl-2">
						<DocIcon kind={kind} />
						<RenameField
							filename={doc.filename}
							onCommit={(to) => {
								setRenaming(false);
								if (to) onRename(to);
							}}
							onCancel={() => setRenaming(false)}
						/>
					</div>
				) : (
					<button
						type="button"
						onClick={onOpen}
						className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left"
					>
						<DocIcon kind={kind} />
						<span className="min-w-0 flex-1 truncate text-sm">
							{doc.filename}
						</span>
					</button>
				)}
				{/* shrink-0 — the title truncates, these stay pinned right. */}
				<div className="flex shrink-0 items-center gap-0.5 pl-1">
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
					/>
				</div>
			</div>
			<div className="pr-2 pb-1 pl-8">
				<InlineEdit
					value={doc.label ?? ""}
					onCommit={(label) => onUpdate({ label })}
					placeholder="Add a label…"
					className="text-xs text-muted-foreground"
				/>
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
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-white hover:bg-destructive/90"
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
}: {
	doc: Document;
	kind: DocKind;
	onUpdate: (patch: Partial<Document>) => void;
	onEditCopy: () => void;
	onStartRename: () => void;
	onAskDelete: () => void;
}) {
	// Originals are the attorney's files — Patrick never renames/deletes them;
	// instead it offers an editable working copy.
	const isPatrick = !!doc.createdInPatrick;
	const canEditCopy = kind === "docx" && !isPatrick;

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
				<MenuItem onClick={() => onUpdate({ starred: !doc.starred })}>
					{doc.starred ? "Unstar" : "Star"}
				</MenuItem>
				<MenuItem onClick={() => onUpdate({ excluded: !doc.excluded })}>
					{doc.excluded ? "Include for AgentPat" : "Exclude from AgentPat"}
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

function DocIcon({ kind }: { kind: DocKind }) {
	return (
		<FileText
			className={cn(
				"size-4 shrink-0",
				kind === "pdf" ? "text-red-500/80" : "text-sky-600/80",
			)}
		/>
	);
}
