import { cn } from "@/lib/utils";

// A product screenshot framed like an app window — hairline border, soft shadow,
// a title bar — so it reads as a solid, composed object that anchors a section.
// Pass a light/dark pair; the matching one shows for the active theme. Until
// images are wired it renders a placeholder describing what to capture.
export function Shot({
	light,
	dark,
	alt,
	capture,
	className,
}: {
	light?: string;
	dark?: string;
	alt?: string;
	capture: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/5",
				className,
			)}
		>
			<div className="flex h-9 items-center gap-1.5 border-b border-border px-4">
				<span className="size-2.5 rounded-full bg-muted-foreground/25" />
				<span className="size-2.5 rounded-full bg-muted-foreground/25" />
				<span className="size-2.5 rounded-full bg-muted-foreground/25" />
			</div>
			{light || dark ? (
				<>
					{light && (
						<img src={light} alt={alt} loading="lazy" className="w-full dark:hidden" />
					)}
					{dark && (
						<img
							src={dark}
							alt={alt}
							loading="lazy"
							className="hidden w-full dark:block"
						/>
					)}
				</>
			) : (
				<div className="flex aspect-[16/10] items-center justify-center bg-muted/40 p-8 text-center">
					<p className="max-w-md text-sm text-muted-foreground">
						<span className="mb-1 block text-xs font-medium uppercase tracking-[0.2em] text-foreground">
							Screenshot to capture
						</span>
						{capture}
					</p>
				</div>
			)}
		</div>
	);
}
