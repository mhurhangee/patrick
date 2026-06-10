import { createRootRoute, Outlet } from "@tanstack/react-router";

// Root layout. Providers (theme, etc.) live in main.tsx; chrome goes here later.
export const Route = createRootRoute({
	component: Outlet,
});
