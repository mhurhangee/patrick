import type { Document } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import { EyeOff, FileText, MoreHorizontal, Star } from "lucide-react";
import type { ReactNode } from "react";
import { InlineEdit } from "@/components/inline-edit";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSaveDocuments, useTaskDocuments } from "@/hooks/use-tasks";
import { useActiveTask } from "@/lib/active-task";
import { cn } from "@/lib/utils";
import { type DocKind, useWorkspace } from "@/lib/workspace";
import { Section } from "./section";

type RowState = "closed" | "open" | "focused";

export function DocumentsNav() {
	const navigate = useNavigate();
	const { activeTaskId } = useActiveTask();
	const { data: documents } = useTaskDocuments(activeTaskId);
	const save = useSaveDocuments(activeTaskId ?? "");
	const { isOpen, focused, open } = useWorkspace();

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

	return (
		<Section label="Documents">
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
				/>
			))}
		</Section>
	);
}

function DocumentRow({
	doc,
	state,
	onOpen,
	onUpdate,
}: {
	doc: Document;
	state: RowState;
	onOpen: () => void;
	onUpdate: (patch: Partial<Document>) => void;
}) {
	const kind: DocKind = doc.filename.toLowerCase().endsWith(".pdf")
		? "pdf"
		: "docx";

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
				{/* shrink-0 — the title truncates, these stay pinned right. */}
				<div className="flex shrink-0 items-center gap-0.5 pl-1">
					{doc.starred && (
						<Star className="size-3.5 fill-current text-primary" />
					)}
					{doc.excluded && (
						<EyeOff className="size-3.5 text-muted-foreground" />
					)}
					<DocumentMenu doc={doc} onUpdate={onUpdate} />
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
		</div>
	);
}

function DocumentMenu({
	doc,
	onUpdate,
}: {
	doc: Document;
	onUpdate: (patch: Partial<Document>) => void;
}) {
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
				<MenuItem onClick={() => onUpdate({ starred: !doc.starred })}>
					{doc.starred ? "Unstar" : "Star"}
				</MenuItem>
				<MenuItem onClick={() => onUpdate({ excluded: !doc.excluded })}>
					{doc.excluded ? "Include for AgentPat" : "Exclude from AgentPat"}
				</MenuItem>
				<Tooltip>
					<TooltipTrigger>
						<MenuItem disabled={!doc.createdInPatrick}>Rename</MenuItem>
					</TooltipTrigger>
					<TooltipContent side="right">
						Original file — rename it in your folder
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger>
						<MenuItem destructive disabled={!doc.createdInPatrick}>
							Delete
						</MenuItem>
					</TooltipTrigger>
					<TooltipContent side="right">
						Original file — delete it in your folder
					</TooltipContent>
				</Tooltip>
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
