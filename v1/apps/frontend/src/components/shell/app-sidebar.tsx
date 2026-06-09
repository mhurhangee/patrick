import { Link } from "@tanstack/react-router";
import {
	ArrowLeftRight,
	ChevronsUpDown,
	EyeOff,
	FileText,
	MessageSquare,
	MoreHorizontal,
	Plus,
	Star,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useProfile } from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import {
	activeTask,
	mockArtifacts,
	mockChats,
	mockSources,
	mockTasks,
} from "@/lib/mock-data";
import { initialsOf } from "@/lib/text";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

type RowState = "closed" | "open" | "focused";

const sourceMenu = ["Rename", "Add tag", "Star", "Exclude from AgentPat"];
const artifactMenu = [
	"Rename",
	"Add tag",
	"Star",
	"Exclude from AgentPat",
	"Delete",
];
const chatMenu = ["Rename", "Star", "Delete"];

export function AppSidebar() {
	const { isOpen, focused, open } = useWorkspace();

	const docState = (id: string): RowState =>
		focused === id ? "focused" : isOpen(id) ? "open" : "closed";

	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			<TaskSwitcher />
			<Separator />

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-5 p-2">
					<Section
						label="Documents"
						action={<RowAction title="Add document" />}
					>
						{mockSources.map((s) => (
							<NavRow
								key={s.id}
								icon={<DocIcon kind={s.kind} />}
								label={s.filename}
								sub={<Awareness signpost={s.signpost} tags={s.tags} />}
								state={docState(s.id)}
								muted={s.excluded}
								menu={sourceMenu}
								onClick={() => open(s.id)}
								trailing={
									s.excluded ? (
										<EyeOff className="size-3.5" />
									) : s.starred ? (
										<Star className="size-3.5 fill-current text-primary" />
									) : null
								}
							/>
						))}
						{mockArtifacts.map((a) => (
							<NavRow
								key={a.id}
								icon={<DocIcon kind="docx" />}
								label={a.title}
								state={docState(a.id)}
								menu={artifactMenu}
								onClick={() => open(a.id)}
							/>
						))}
					</Section>

					<Section label="Chats" action={<RowAction title="New chat" />}>
						{mockChats.map((c) => (
							<NavRow
								key={c.id}
								icon={
									<MessageSquare className="size-4 text-muted-foreground" />
								}
								label={c.title}
								sub={
									<span className="block truncate text-xs text-muted-foreground">
										{c.preview}
									</span>
								}
								state={c.active ? "focused" : "closed"}
								menu={chatMenu}
							/>
						))}
					</Section>
				</div>
			</ScrollArea>

			<Separator />
			<SidebarFooter />
		</div>
	);
}

function DocIcon({ kind }: { kind: "pdf" | "docx" }) {
	return (
		<FileText
			className={cn(
				"size-4",
				kind === "pdf" ? "text-red-500/80" : "text-sky-600/80",
			)}
		/>
	);
}

function Awareness({ signpost, tags }: { signpost: string; tags: string[] }) {
	return (
		<span className="mt-0.5 flex min-w-0 items-center gap-1">
			{tags.map((t) => (
				<span
					key={t}
					className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground"
				>
					{t}
				</span>
			))}
			<span className="truncate text-xs text-muted-foreground">{signpost}</span>
		</span>
	);
}

function TaskSwitcher() {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
				>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">
							{activeTask.title}
						</div>
						<div className="truncate text-xs text-muted-foreground">
							{activeTask.reference}
						</div>
					</div>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 gap-0.5 p-1">
				{mockTasks.map((t) => (
					<button
						type="button"
						key={t.id}
						className={cn(
							"flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-left hover:bg-accent",
							t.id === activeTask.id && "bg-accent",
						)}
					>
						<span className="truncate text-sm">{t.title}</span>
						<span className="ml-auto shrink-0 text-xs text-muted-foreground">
							{t.reference}
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

function SidebarFooter() {
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);

	const name = profile?.identity.name || "No profile";
	const firm = profile?.identity.firm || "";
	const connected = !!profile?.ai.apiKey;

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
			<Button
				asChild
				variant="ghost"
				size="icon"
				title={connected ? "AI configured" : "No API key set"}
			>
				<Link to="/profile">
					<span
						className={cn(
							"size-2.5 rounded-full",
							connected ? "bg-emerald-500" : "bg-muted-foreground/40",
						)}
					/>
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
	action,
	children,
}: {
	label: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div>
			<div className="flex items-center justify-between px-2 pb-1">
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
				{action}
			</div>
			<div className="space-y-0.5">{children}</div>
		</div>
	);
}

function NavRow({
	icon,
	label,
	sub,
	state,
	muted,
	trailing,
	menu,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	sub?: ReactNode;
	state: RowState;
	muted?: boolean;
	trailing?: ReactNode;
	menu: string[];
	onClick?: () => void;
}) {
	return (
		<div
			className={cn(
				"group flex items-start gap-1 rounded-none border-l-2 pr-1 transition-colors hover:bg-sidebar-accent",
				state === "focused"
					? "border-primary bg-sidebar-accent/50"
					: state === "open"
						? "border-primary/40"
						: "border-transparent",
				muted && "opacity-50",
			)}
		>
			<button
				type="button"
				onClick={onClick}
				className="flex min-w-0 flex-1 items-start gap-2 py-1.5 pl-2 text-left"
			>
				<span className="mt-0.5 shrink-0">{icon}</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm">{label}</span>
					{sub}
				</span>
			</button>
			{trailing && (
				<span className="mt-1.5 px-1 text-muted-foreground group-hover:hidden">
					{trailing}
				</span>
			)}
			<RowMenu items={menu} />
		</div>
	);
}

function RowMenu({ items }: { items: string[] }) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					title="More"
					className="mt-1 hidden rounded p-1 text-muted-foreground hover:bg-accent group-hover:block data-[state=open]:block"
				>
					<MoreHorizontal className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-48 gap-0.5 p-1">
				{items.map((item) => (
					<button
						type="button"
						key={item}
						className={cn(
							"flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
							item === "Delete" && "text-destructive",
						)}
					>
						{item}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}

function RowAction({ title }: { title: string }) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className="size-6 text-muted-foreground"
			title={title}
		>
			<Plus />
		</Button>
	);
}
