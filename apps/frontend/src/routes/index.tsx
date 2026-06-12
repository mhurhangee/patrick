import { createFileRoute, redirect } from "@tanstack/react-router";

// There is no landing page anymore — launch straight into the shell, which
// shows the right empty state (create a profile / open a folder) on first run.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/workspace" });
	},
});
