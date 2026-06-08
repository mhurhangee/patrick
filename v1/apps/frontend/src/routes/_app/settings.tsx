import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ColourTheme = {
	id: string;
	label: string;
	primary: string;
	ring: string;
};

const colourThemes: ColourTheme[] = [
	{
		id: "emerald",
		label: "Emerald",
		primary: "oklch(0.508 0.118 165.612)",
		ring: "oklch(0.709 0.01 56.259)",
	},
	{
		id: "blue",
		label: "Blue",
		primary: "oklch(0.55 0.18 255)",
		ring: "oklch(0.62 0.16 255)",
	},
	{
		id: "violet",
		label: "Violet",
		primary: "oklch(0.55 0.2 295)",
		ring: "oklch(0.62 0.18 295)",
	},
	{
		id: "stone",
		label: "Stone",
		primary: "oklch(0.45 0.01 60)",
		ring: "oklch(0.55 0.01 60)",
	},
];

const modes = [
	{ id: "light", label: "Light" },
	{ id: "dark", label: "Dark" },
	{ id: "system", label: "System" },
] as const;

export const Route = createFileRoute("/_app/settings")({
	component: Settings,
});

function Settings() {
	const { theme, setTheme } = useTheme();
	const [colour, setColour] = useState("emerald");
	const [scale, setScale] = useState(1);

	function onColour(t: ColourTheme) {
		setColour(t.id);
		const root = document.documentElement.style;
		root.setProperty("--primary", t.primary);
		root.setProperty("--primary-foreground", "oklch(0.985 0 0)");
		root.setProperty("--ring", t.ring);
		root.setProperty("--sidebar-primary", t.primary);
		root.setProperty("--sidebar-ring", t.ring);
	}

	function onScale(value: number) {
		setScale(value);
		document.documentElement.style.setProperty("--ui-scale", String(value));
	}

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto max-w-2xl space-y-6 p-8">
				<div className="space-y-3">
					<Button asChild variant="ghost" size="sm" className="-ml-2">
						<Link to="/workspace">
							<ArrowLeft />
							Workspace
						</Link>
					</Button>
					<h1>Appearance</h1>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Theme</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-2">
							<Label>Colour</Label>
							<div className="flex gap-2">
								{colourThemes.map((t) => (
									<button
										type="button"
										key={t.id}
										title={t.label}
										onClick={() => onColour(t)}
										className={cn(
											"flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-colors",
											colour === t.id ? "ring-ring" : "ring-transparent",
										)}
										style={{ backgroundColor: t.primary }}
									>
										{colour === t.id && <Check className="size-4 text-white" />}
									</button>
								))}
							</div>
						</div>

						<div className="space-y-2">
							<Label>Mode</Label>
							<div className="flex gap-1.5">
								{modes.map((m) => (
									<Button
										key={m.id}
										type="button"
										size="sm"
										variant={theme === m.id ? "default" : "outline"}
										onClick={() => setTheme(m.id)}
									>
										{m.label}
									</Button>
								))}
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label htmlFor="ui-scale">UI scale</Label>
								<span className="text-xs tabular-nums text-muted-foreground">
									{Math.round(scale * 100)}%
								</span>
							</div>
							<input
								id="ui-scale"
								type="range"
								min={0.85}
								max={1.25}
								step={0.05}
								value={scale}
								onChange={(e) => onScale(Number(e.target.value))}
								className="w-full accent-primary"
							/>
							<p className="text-xs text-muted-foreground">
								Scales text and spacing together for readability.
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>About</CardTitle>
					</CardHeader>
					<CardContent className="text-sm text-muted-foreground">
						Patrick — local-first patent prosecution assistant. Version 0.0.1.
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
