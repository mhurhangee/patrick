import type { Appearance, ThemeMode } from "@patrick/shared";
import { Check } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { applyColour, applyScale, COLOUR_THEMES } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const MODES: { id: ThemeMode; label: string }[] = [
	{ id: "light", label: "Light" },
	{ id: "dark", label: "Dark" },
	{ id: "system", label: "System" },
];

export function AppearanceSection({
	value,
	onChange,
}: {
	value: Appearance;
	onChange: (value: Appearance) => void;
}) {
	const { setTheme } = useTheme();

	const setColour = (theme: string) => {
		applyColour(theme);
		onChange({ ...value, theme });
	};

	const setMode = (mode: ThemeMode) => {
		setTheme(mode);
		onChange({ ...value, mode });
	};

	const setScale = (scale: number) => {
		applyScale(scale);
		onChange({ ...value, scale });
	};

	return (
		<FieldGroup>
			<Field>
				<FieldLabel>Colour</FieldLabel>
				<div className="flex gap-2">
					{COLOUR_THEMES.map((t) => (
						<Tooltip key={t.id}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => setColour(t.id)}
									className={cn(
										"flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-colors",
										value.theme === t.id ? "ring-ring" : "ring-transparent",
									)}
									style={{ backgroundColor: t.primary }}
								>
									{value.theme === t.id && (
										<Check className="size-4 text-white" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent>{t.label}</TooltipContent>
						</Tooltip>
					))}
				</div>
				<FieldDescription>Retheme to your firm's colour.</FieldDescription>
			</Field>

			<Field>
				<FieldLabel>Mode</FieldLabel>
				<div className="flex gap-1.5">
					{MODES.map((m) => (
						<Button
							key={m.id}
							type="button"
							size="sm"
							variant={value.mode === m.id ? "default" : "outline"}
							onClick={() => setMode(m.id)}
						>
							{m.label}
						</Button>
					))}
				</div>
			</Field>

			<Field>
				<div className="flex items-center justify-between">
					<FieldLabel htmlFor="ui-scale">UI scale</FieldLabel>
					<span className="text-xs tabular-nums text-muted-foreground">
						{Math.round(value.scale * 100)}%
					</span>
				</div>
				<input
					id="ui-scale"
					type="range"
					min={0.85}
					max={1.25}
					step={0.05}
					value={value.scale}
					onChange={(e) => setScale(Number(e.target.value))}
					className="w-full accent-primary"
				/>
				<FieldDescription>
					Scales text and spacing together for readability.
				</FieldDescription>
			</Field>
		</FieldGroup>
	);
}
