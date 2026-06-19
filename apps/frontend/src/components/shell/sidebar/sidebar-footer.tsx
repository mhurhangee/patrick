import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import { ProfileTemplateItems } from "@/components/profile/profile-template-items";
import { FeedbackButton } from "@/components/shell/sidebar/feedback-button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNewProfile } from "@/hooks/use-create-flows";
import {
	type KeyStatus,
	keyStatusOf,
	useKeyVerification,
} from "@/hooks/use-key-verification";
import { useProfile, useProfiles } from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import { initialsOf } from "@/lib/text";
import { cn } from "@/lib/utils";

const DOT_COLOR: Record<KeyStatus, string> = {
	valid: "bg-emerald-500",
	invalid: "bg-amber-500",
	verifying: "bg-muted-foreground/40 animate-pulse",
	idle: "bg-muted-foreground/40",
};

export function SidebarFooter() {
	const navigate = useNavigate();
	const { activeProfileId, setActiveProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);
	const { data: profiles } = useProfiles();
	const { newProfile } = useNewProfile();
	const onSettings = useLocation({ select: (l) => l.pathname === "/profile" });

	const name = profile?.identity.name || "No profile";
	const author = profile?.identity.author || "";

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
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className={cn(
							"flex h-auto min-w-0 flex-1 items-center gap-2 rounded-none border-l-2 px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent",
							onSettings
								? "border-primary bg-sidebar-accent/50"
								: "border-transparent",
						)}
					>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
							{initialsOf(name)}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm">{name}</span>
							{author && (
								<span className="block truncate text-xs text-muted-foreground">
									{author}
								</span>
							)}
						</span>
						<span
							title={dotTitle}
							className={cn(
								"size-2.5 shrink-0 rounded-full",
								DOT_COLOR[status],
							)}
						/>
						<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" side="top" className="w-60">
					<DropdownMenuLabel>Profiles</DropdownMenuLabel>
					{profiles?.map((p) => (
						<DropdownMenuItem
							key={p.id}
							onSelect={() => setActiveProfileId(p.id)}
							className="gap-2"
						>
							<Check
								className={cn(
									"size-3.5",
									p.id === activeProfileId ? "opacity-100" : "opacity-0",
								)}
							/>
							<div className="min-w-0 flex-1">
								<div className="truncate">{p.name || "Untitled profile"}</div>
								{p.author && (
									<div className="truncate text-[0.625rem] text-muted-foreground">
										{p.author}
									</div>
								)}
							</div>
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<Plus />
							New profile
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-64">
							<ProfileTemplateItems onPick={newProfile} />
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuItem
						onSelect={() => navigate({ to: "/profile", hash: "ai" })}
						disabled={!activeProfileId}
					>
						<span
							className={cn("size-2 shrink-0 rounded-full", DOT_COLOR[status])}
						/>
						AI &amp; keys
						<span className="ml-auto text-[0.625rem] text-muted-foreground">
							{dotTitle}
						</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => navigate({ to: "/profile" })}
						disabled={!activeProfileId}
					>
						<Settings2 />
						Profile settings
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<FeedbackButton />
		</div>
	);
}
