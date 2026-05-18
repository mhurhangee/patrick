import { LayoutDashboard, Database, Server, Monitor, Code } from "lucide-react"

export const DOC_NAV = [
	{ to: "/docs/architecture" as const, label: "Architecture", icon: LayoutDashboard },
	{ to: "/docs/frontend" as const, label: "Frontend", icon: Code },
	{ to: "/docs/api" as const, label: "API", icon: Server },
	{ to: "/docs/database" as const, label: "Database", icon: Database },
	{ to: "/docs/desktop" as const, label: "Desktop", icon: Monitor },
]
