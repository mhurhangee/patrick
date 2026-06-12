"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Footer toggle so visitors can find dark mode (the `d` shortcut works too).
// Gated on mount so the icon doesn't mismatch between server + client.
export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	const dark = mounted && resolvedTheme === "dark";

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Toggle dark mode"
			onClick={() => setTheme(dark ? "light" : "dark")}
		>
			{dark ? <Sun /> : <Moon />}
		</Button>
	);
}
