import Link from "next/link";
import { NAV_LINKS } from "@/lib/links";

// The top-level nav links, shared by the header, footer, and mobile menu. The
// caller supplies the link styling via className.
export function NavLinks({ className }: { className?: string }) {
	return (
		<>
			{NAV_LINKS.map((l) =>
				l.external ? (
					<a
						key={l.href}
						href={l.href}
						target="_blank"
						rel="noreferrer"
						className={className}
					>
						{l.label}
					</a>
				) : (
					<Link key={l.href} href={l.href} className={className}>
						{l.label}
					</Link>
				),
			)}
		</>
	);
}
