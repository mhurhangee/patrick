import type { Provider } from "@patrick/shared";
import { cn } from "@/lib/utils";

// Brand SVGs live in /public. Google ships a multicolour mark; the rest are
// monochrome black, so they follow the theme via dark:invert (black in light,
// white in dark). The gateway is Vercel.
const LOGO: Record<
	Provider,
	{ src: string; monochrome: boolean; cls?: string }
> = {
	// Anthropic's wordmark is visually heavier, so trim it a touch to match.
	anthropic: { src: "/anthropic.svg", monochrome: true, cls: "h-4" },
	openai: { src: "/openai.svg", monochrome: true },
	google: { src: "/google.svg", monochrome: false },
	gateway: { src: "/vercel.svg", monochrome: true },
};

/** A provider's brand mark, normalised to a consistent height. */
export function ProviderLogo({
	provider,
	className,
}: {
	provider: Provider;
	className?: string;
}) {
	const { src, monochrome, cls } = LOGO[provider];
	return (
		<img
			src={src}
			alt=""
			aria-hidden
			className={cn(
				"h-5 w-auto shrink-0 object-contain",
				monochrome && "dark:invert",
				cls,
				className,
			)}
		/>
	);
}
