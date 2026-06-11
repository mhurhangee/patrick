import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Cycles a single word with a quiet crossfade (no flip). All words stack in one
// grid cell so the slot is as wide as the longest — nothing shifts. Reduced
// motion holds the first word.
export function RotatingWord({
	words,
	className,
	interval = 2600,
}: {
	words: string[];
	className?: string;
	interval?: number;
}) {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (prefersReducedMotion()) return;
		const id = setInterval(
			() => setIndex((i) => (i + 1) % words.length),
			interval,
		);
		return () => clearInterval(id);
	}, [words.length, interval]);

	return (
		<span className="relative inline-grid">
			{words.map((word, i) => (
				<span
					key={word}
					aria-hidden={i !== index}
					className={cn(
						"col-start-1 row-start-1 transition-opacity duration-500 motion-reduce:transition-none",
						i === index ? "opacity-100" : "opacity-0",
						className,
					)}
				>
					{word}
				</span>
			))}
		</span>
	);
}
