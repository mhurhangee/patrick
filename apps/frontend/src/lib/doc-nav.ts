import { BookOpen, Rocket } from "lucide-react"

export const DOC_NAV = [
	{
		to: "/docs/getting-started" as const,
		label: "Getting Started",
		icon: BookOpen,
	},
	{ to: "/docs/deployment" as const, label: "Deployment", icon: Rocket },
]
