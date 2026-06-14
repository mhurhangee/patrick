import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { Patrick } from "@/components/patrick";
import { ProfileTemplateItems } from "@/components/profile/profile-template-items";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { SurfaceScaffold } from "@/components/workspace/surface-scaffold";
import { useNewProfile, useNewTask } from "@/hooks/use-create-flows";
import { useProfiles } from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import { isTauri } from "@/lib/desktop";
import { initialsOf } from "@/lib/text";

// Shown in the centre when there's no active profile — the first screen a new
// attorney sees, or the picker when they have profiles but none selected.
export function ProfileWelcome() {
	const navigate = useNavigate();
	const { setActiveProfileId } = useActiveProfile();
	const { data: profiles } = useProfiles();
	const { newProfile, pending } = useNewProfile();
	const hasProfiles = (profiles?.length ?? 0) > 0;

	const choose = (id: string) => {
		setActiveProfileId(id);
		navigate({ to: "/profile" });
	};

	return (
		<SurfaceScaffold>
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia>
						<Patrick size={48} />
					</EmptyMedia>
					<EmptyTitle>
						{hasProfiles ? "Choose a profile" : "Welcome to Patrick"}
					</EmptyTitle>
					<EmptyDescription>
						{hasProfiles
							? "Pick the profile to work as, or create another."
							: "A profile holds who you are, your AI key, and how Patrick writes. Start from a template — you can change everything after."}
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					{hasProfiles &&
						profiles?.map((p) => (
							<button
								type="button"
								key={p.id}
								onClick={() => choose(p.id)}
								className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
							>
								<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
									{initialsOf(p.name)}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-medium">
										{p.name || "Untitled profile"}
									</span>
									{p.author && (
										<span className="block truncate text-xs text-muted-foreground">
											{p.author}
										</span>
									)}
								</span>
							</button>
						))}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant={hasProfiles ? "outline" : "default"}
								size="lg"
								disabled={pending}
								className="mt-1"
							>
								<Plus />
								{pending
									? "Creating…"
									: hasProfiles
										? "New profile"
										: "Create a profile"}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="center" className="w-72">
							<ProfileTemplateItems onPick={newProfile} />
						</DropdownMenuContent>
					</DropdownMenu>
				</EmptyContent>
			</Empty>
		</SurfaceScaffold>
	);
}

// Shown in the centre when there's a profile but no open task. Desktop pops the
// native folder picker; the browser falls back to a typed path.
export function OpenFolderEmpty() {
	const { newTaskFromFolder, pickAndCreate, pending, isError } = useNewTask();
	const [folder, setFolder] = useState("");

	return (
		<SurfaceScaffold>
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FolderOpen />
					</EmptyMedia>
					<EmptyTitle>Open a matter folder</EmptyTitle>
					<EmptyDescription>
						A task is just a folder you already have. Patrick reads its
						documents — and never changes your originals.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					{isTauri() ? (
						<Button size="lg" disabled={pending} onClick={pickAndCreate}>
							<FolderOpen />
							{pending ? "Opening…" : "Choose a folder…"}
						</Button>
					) : (
						<>
							<div className="flex w-full gap-2">
								<Input
									value={folder}
									placeholder="/path/to/the/matter/folder"
									onChange={(e) => setFolder(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") newTaskFromFolder(folder);
									}}
								/>
								<Button
									onClick={() => newTaskFromFolder(folder)}
									disabled={!folder.trim() || pending}
								>
									{pending ? "Opening…" : "Open"}
								</Button>
							</div>
							{isError && (
								<p className="text-xs text-destructive">
									Couldn't open that folder — check the path.
								</p>
							)}
						</>
					)}
				</EmptyContent>
			</Empty>
		</SurfaceScaffold>
	);
}
