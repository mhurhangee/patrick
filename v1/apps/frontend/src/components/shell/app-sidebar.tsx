import { Separator } from "@/components/ui/separator";
import { ChatsNav } from "./sidebar/chats-nav";
import { DocumentsNav } from "./sidebar/documents-nav";
import { SidebarFooter } from "./sidebar/sidebar-footer";
import { TaskSwitcher } from "./sidebar/task-switcher";

export function AppSidebar() {
	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			<TaskSwitcher />
			<Separator />

			<div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
				<div className="space-y-5 p-2">
					<DocumentsNav />
					<ChatsNav />
				</div>
			</div>

			<Separator />
			<SidebarFooter />
		</div>
	);
}
