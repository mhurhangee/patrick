import type { Metadata } from "next"

import { IBM_Plex_Mono, IBM_Plex_Sans, Lora } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const fontHeading = Lora({ subsets: ["latin"], variable: "--font-heading" })

const fontSans = IBM_Plex_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
})

const fontMono = IBM_Plex_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	weight: "400",
})

export const metadata: Metadata = {
	title: "PatrickOS",
	description: "Local-first, open-source patent drafting assistant.",
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={cn(
				"antialiased",
				fontMono.variable,
				"font-sans",
				fontSans.variable,
				fontHeading.variable,
			)}
		>
			<body>
				<TooltipProvider>
					<ThemeProvider>{children}</ThemeProvider>
				</TooltipProvider>
			</body>
		</html>
	)
}
