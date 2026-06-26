import { Button } from "@patrick/ui/components/button";
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
} from "@patrick/ui/components/dropdown-menu";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import { KeyStatusDot, keyStatusLabel } from "@/components/key-status-dot";
import { ProfileTemplateItems } from "@/components/profile/profile-template-items";
import { useNewProfile } from "@/hooks/use-create-flows";
import { keyStatusOf, useKeyVerification } from "@/hooks/use-key-verification";
import { useProfile, useProfiles } from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import { initialsOf } from "@/lib/text";
import { cn } from "@/lib/utils";

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
	const dotTitle = keyStatusLabel(status, hasKey);

	return (
		<div>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="row"
						aria-current={onSettings || undefined}
						className="min-w-0"
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
						<KeyStatusDot status={status} title={dotTitle} />
						<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
					</Button>
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
						<KeyStatusDot status={status} className="size-2" />
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
		</div>
	);
}
