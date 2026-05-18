import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"
import { AppHeader } from "@/components/app-header"
import { DocNavigation } from "@/components/doc-navigation"
import { DOC_NAV } from "@/lib/doc-nav"
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@/components/ui/sidebar"

export const Route = createFileRoute("/docs")({
	component: DocsLayout,
})

function DocsLayout() {
	const pathname = useRouterState({ select: (s) => s.location.pathname })

	return (
		<SidebarProvider>
			<Sidebar>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Documentation</SidebarGroupLabel>
						<SidebarMenu>
							{DOC_NAV.map(({ to, label, icon: Icon }) => (
								<SidebarMenuItem key={to}>
									<SidebarMenuButton asChild isActive={pathname === to}>
										<Link to={to}>
											<Icon size={14} />
											{label}
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroup>
				</SidebarContent>
			</Sidebar>
			<SidebarInset>
				<AppHeader />
				<main className="p-8">
					<Outlet />
					<DocNavigation />
				</main>
			</SidebarInset>
		</SidebarProvider>
	)
}
