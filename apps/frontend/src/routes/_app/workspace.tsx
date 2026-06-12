import { createFileRoute } from "@tanstack/react-router";
import { DocumentViewer } from "@/components/workspace/document-viewer";
import {
	OpenFolderEmpty,
	ProfileWelcome,
} from "@/components/workspace/empty-states";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";

export const Route = createFileRoute("/_app/workspace")({
	component: WorkspaceCenter,
});

// The default centre. Progressive empty states stand in for the old onboarding
// flow: no profile → welcome; no task → open a folder; otherwise the documents.
function WorkspaceCenter() {
	const { activeProfileId } = useActiveProfile();
	const { activeTaskId } = useActiveTask();

	if (!activeProfileId) return <ProfileWelcome />;
	if (!activeTaskId) return <OpenFolderEmpty />;
	return <DocumentViewer />;
}
