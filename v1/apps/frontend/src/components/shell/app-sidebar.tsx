import type { Document } from "@patrick/shared";
import { Link } from "@tanstack/react-router";
import {
	ArrowLeftRight,
	ChevronsUpDown,
	EyeOff,
	FileText,
	MessageSquare,
	MoreHorizontal,
	Star,
} from "lucide-react";
import { InlineEdit } from "@/components/inline-edit";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	type KeyStatus,
	keyStatusOf,
	useKeyVerification,
} from "@/hooks/use-key-verification";
import { useProfile } from "@/hooks/use-profiles";
import {
	useSaveDocuments,
	useTask,
	useTaskDocuments,
	useTasks,
} from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { mockChats } from "@/lib/mock-data";
import { initialsOf } from "@/lib/text";
import { cn } from "@/lib/utils";
import { type DocKind, useWorkspace } from "@/lib/workspace";

type RowState = "closed" | "open" | "focused";

export function AppSidebar() {
	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			<TaskSwitcher />
			<Separator />

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-5 p-2">
					<DocumentsSection />
					<ChatsSection />
				</div>
			</ScrollArea>

			<Separator />
			<SidebarFooter />
		</div>
	);
}

function TaskSwitcher() {
	const { activeTaskId, setActiveTaskId } = useActiveTask();
	const { data: task } = useTask(activeTaskId);
	const { data: tasks } = useTasks();

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
				>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">
							{task?.label || "No task"}
						</div>
						<div className="truncate text-xs text-muted-foreground">
							{task?.folder}
						</div>
					</div>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 gap-0.5 p-1">
				{tasks?.map((t) => (
					<button
						type="button"
						key={t.id}
						onClick={() => setActiveTaskId(t.id)}
						className={cn(
							"flex w-full flex-col rounded-sm px-2 py-1 text-left hover:bg-accent",
							t.id === activeTaskId && "bg-accent",
						)}
					>
						<span className="truncate text-sm">
							{t.label || "Untitled task"}
						</span>
						<span className="truncate text-xs text-muted-foreground">
							{t.folder}
						</span>
					</button>
				))}
				<Separator className="my-0.5" />
				<Button
					asChild
					variant="ghost"
					size="sm"
					className="w-full justify-start"
				>
					<Link to="/tasks">All tasks…</Link>
				</Button>
			</PopoverContent>
		</Popover>
	);
}

function DocumentsSection() {
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
					onOpen={() => open(doc.filename)}
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
			<div className="flex items-center gap-1 pr-1">
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
				{doc.starred && (
					<Star className="size-3.5 shrink-0 fill-current text-primary group-hover:hidden" />
				)}
				{doc.excluded && (
					<EyeOff className="size-3.5 shrink-0 text-muted-foreground group-hover:hidden" />
				)}
				<DocumentMenu doc={doc} onUpdate={onUpdate} />
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
					className="hidden shrink-0 rounded p-1 text-muted-foreground hover:bg-accent group-hover:block data-[state=open]:block"
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
				<Separator className="my-0.5" />
				<MenuItem
					destructive
					disabled={!doc.createdInPatrick}
					title={
						doc.createdInPatrick
							? undefined
							: "Original file — manage it in your folder"
					}
				>
					Delete
				</MenuItem>
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
	children: React.ReactNode;
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

function ChatsSection() {
	return (
		<Section label="Chats">
			{mockChats.map((c) => (
				<div
					key={c.id}
					className={cn(
						"group flex items-start gap-2 rounded-none border-l-2 py-1.5 pr-1 pl-2 transition-colors hover:bg-sidebar-accent",
						c.active
							? "border-primary bg-sidebar-accent/50"
							: "border-transparent",
					)}
				>
					<MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<span className="min-w-0 flex-1">
						<span className="block truncate text-sm">{c.title}</span>
						<span className="block truncate text-xs text-muted-foreground">
							{c.preview}
						</span>
					</span>
				</div>
			))}
		</Section>
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

const DOT_COLOR: Record<KeyStatus, string> = {
	valid: "bg-emerald-500",
	invalid: "bg-amber-500",
	verifying: "bg-muted-foreground/40 animate-pulse",
	idle: "bg-muted-foreground/40",
};

function SidebarFooter() {
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);

	const name = profile?.identity.name || "No profile";
	const firm = profile?.identity.firm || "";

	const hasKey = !!profile?.ai.apiKey;
	const verification = useKeyVerification(
		profile?.ai.provider,
		profile?.ai.apiKey,
		{ enabled: hasKey },
	);
	const status = keyStatusOf(verification);
	const dotTitle = !hasKey
		? "No API key set"
		: status === "valid"
			? "AI key verified"
			: status === "verifying"
				? "Verifying API key…"
				: "API key not verified — check in profile";

	return (
		<div className="flex items-center gap-1 p-2">
			<Button
				asChild
				variant="ghost"
				className="h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-1.5"
			>
				<Link to="/profile">
					<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
						{initialsOf(name)}
					</span>
					<span className="min-w-0 flex-1 text-left">
						<span className="block truncate text-sm">{name}</span>
						{firm && (
							<span className="block truncate text-xs text-muted-foreground">
								{firm}
							</span>
						)}
					</span>
				</Link>
			</Button>
			<Button asChild variant="ghost" size="icon" title={dotTitle}>
				<Link to="/profile">
					<span className={cn("size-2.5 rounded-full", DOT_COLOR[status])} />
				</Link>
			</Button>
			<Button asChild variant="ghost" size="icon" title="Switch profile">
				<Link to="/profiles">
					<ArrowLeftRight />
				</Link>
			</Button>
		</div>
	);
}

function Section({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="px-2 pb-1">
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
			</div>
			<div className="space-y-0.5">{children}</div>
		</div>
	);
}
