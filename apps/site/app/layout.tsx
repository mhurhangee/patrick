import type { Metadata } from "next";
import { Geist_Mono, Hanken_Grotesk, Lora } from "next/font/google";

import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const loraHeading = Lora({ subsets: ["latin"], variable: "--font-heading" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
	metadataBase: new URL("https://usepatrick.com"),
	title: {
		default: "Patrick — an agent-first patent-prosecution assistant",
		template: "%s · Patrick",
	},
	description:
		"Open, transparent, and yours. Patrick drafts and redlines office actions and claim amendments in your own Word files, as native tracked changes, on your own computer.",
	icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={cn(
				"antialiased",
				fontMono.variable,
				"font-sans",
				hanken.variable,
				loraHeading.variable,
			)}
		>
			<body className="flex min-h-svh flex-col">
				<ThemeProvider>
					<SiteHeader />
					<main className="flex-1">{children}</main>
					<SiteFooter />
				</ThemeProvider>
			</body>
		</html>
	);
}
