import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

// Footer toggle so web visitors can find dark mode (the app's `d` shortcut works
// too). Flips to the opposite of whatever's currently showing.
export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const resolved =
		theme === "system"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light"
			: theme;

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Toggle dark mode"
			onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
		>
			{resolved === "dark" ? <Sun /> : <Moon />}
		</Button>
	);
}
