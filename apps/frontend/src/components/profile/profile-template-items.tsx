import { PROFILE_TEMPLATES, type ProfileTemplate } from "@patrick/shared";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// The "start from a template" choices, shared by the profile switcher and the
// welcome empty state so the create-a-profile menu lives in one place. Render
// inside any DropdownMenu content (a submenu or a plain menu).
export function ProfileTemplateItems({
	onPick,
}: {
	onPick: (template: ProfileTemplate | null) => void;
}) {
	return (
		<>
			<DropdownMenuLabel>Start from a template</DropdownMenuLabel>
			{PROFILE_TEMPLATES.map((t) => (
				<DropdownMenuItem
					key={t.id}
					onSelect={() => onPick(t)}
					className="flex-col items-start gap-0"
				>
					<span>{t.name}</span>
					<span className="text-[0.625rem] text-muted-foreground">
						{t.description}
					</span>
				</DropdownMenuItem>
			))}
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={() => onPick(null)}>
				Blank profile
			</DropdownMenuItem>
		</>
	);
}
