import { useActiveTask } from "@/lib/active-task";
import { ChatsNav } from "./sidebar/chats-nav";
import { DocumentsNav } from "./sidebar/documents-nav";
import { NotesNav } from "./sidebar/notes-nav";
import { SidebarFooter } from "./sidebar/sidebar-footer";
import { TaskSwitcher } from "./sidebar/task-switcher";

export function AppSidebar() {
	const { activeTaskId } = useActiveTask();

	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			<TaskSwitcher />
			<div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
				{activeTaskId ? (
					<div className="space-y-5 p-2">
						<NotesNav />
						<DocumentsNav />
						<ChatsNav />
					</div>
				) : (
					<p className="px-3 py-4 text-xs text-muted-foreground/50">
						Open a folder to see its documents, brief, and chats.
					</p>
				)}
			</div>

			<SidebarFooter />
		</div>
	);
}
