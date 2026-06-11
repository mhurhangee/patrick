/**
 * Patrick — the mark as a component.
 *
 * Variants:
 *   "static"   — the mark, no background (default)
 *   "tile"     — app-icon style: mark on a rounded deep-forest tile
 *   "scanning" — coral accent hops clockwise through the cells (loading)
 *   "drawing"  — fourth cell draws itself in and fills (loading / success loop)
 *
 * Requires the tokens + keyframes from patrick.css in your globals.
 * Colours come exclusively from --patrick-* variables — the mark never
 * follows the customer theme's --primary.
 *
 * Usage:
 *   <Patrick />                            // static, 32px
 *   <Patrick size={64} variant="tile" />
 *   <Patrick size={16} variant="scanning" label="Searching prior art" />
 *   <Patrick variant="drawing" />
 */

type PatrickProps = {
	variant?: "static" | "tile" | "scanning" | "drawing";
	/** Rendered width/height in px. */
	size?: number;
	className?: string;
	/** Accessible label. Animated variants announce as status. */
	label?: string;
};

const CELLS = {
	tl: "M300 80 H304 A30 30 0 0 1 334 110 V136 A8 8 0 0 1 326 144 H300 A30 30 0 0 1 270 114 V110 A30 30 0 0 1 300 80 Z",
	tr: "M376 80 H380 A30 30 0 0 1 410 110 V114 A30 30 0 0 1 380 144 H354 A8 8 0 0 1 346 136 V110 A30 30 0 0 1 376 80 Z",
	br: "M354 156 H380 A30 30 0 0 1 410 186 V190 A30 30 0 0 1 380 220 H376 A30 30 0 0 1 346 190 V164 A8 8 0 0 1 354 156 Z",
	bl: "M300 156 H326 A8 8 0 0 1 334 164 V190 A30 30 0 0 1 304 220 H300 A30 30 0 0 1 270 190 V186 A30 30 0 0 1 300 156 Z",
};

const GREEN = "var(--patrick-green)";
const CORAL = "var(--patrick-coral)";

export function Patrick({
	variant = "static",
	size = 32,
	className = "",
	label,
}: PatrickProps) {
	const isLoading = variant === "scanning" || variant === "drawing";
	const a11y = isLoading
		? { role: "status" as const, "aria-label": label ?? "Loading" }
		: { role: "img" as const, "aria-label": label ?? "Patrick" };

	/* Unsure about tile variant and colour scheme */
	if (variant === "tile") {
		return (
			<svg
				width={size}
				height={size}
				viewBox="0 0 512 512"
				className={className}
				{...a11y}
			>
				<title>Patrick Logo</title>
				<rect width="512" height="512" rx="115" fill="var(--patrick-tile)" />
				<g transform="translate(106,106) scale(2.143) translate(-270,-80)">
					<path d={CELLS.tl} fill="var(--patrick-tile-green)" />
					<path d={CELLS.tr} fill="var(--patrick-tile-green)" />
					<path d={CELLS.bl} fill="var(--patrick-tile-green)" />
					<path d={CELLS.br} fill={CORAL} />
				</g>
			</svg>
		);
	}

	if (variant === "scanning") {
		// Clockwise: TL → TR → BR → BL
		const order = [CELLS.tl, CELLS.tr, CELLS.br, CELLS.bl];
		return (
			<svg
				width={size}
				height={size}
				viewBox="0 0 144 144"
				className={className}
				{...a11y}
			>
				<title>Patrick Logo</title>
				<g transform="translate(-268,-78)">
					{order.map((d, i) => (
						<path
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed logo and parts
							key={i}
							d={d}
							className="patrick-hop"
							style={{ animationDelay: `${i * 0.4}s` }}
						/>
					))}
				</g>
			</svg>
		);
	}

	if (variant === "drawing") {
		// Stroke thickens at small sizes so the draw stays visible.
		const strokeWidth = size <= 24 ? 7 : 3;
		return (
			<svg
				width={size}
				height={size}
				viewBox="0 0 144 144"
				className={className}
				{...a11y}
			>
				<title>Patrick Logo</title>
				<g transform="translate(-268,-78)">
					<path d={CELLS.tl} fill={GREEN} />
					<path d={CELLS.tr} fill={GREEN} />
					<path d={CELLS.bl} fill={GREEN} />
					<path
						d={CELLS.br}
						pathLength={100}
						className="patrick-draw"
						strokeWidth={strokeWidth}
					/>
				</g>
			</svg>
		);
	}

	// static
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 144 144"
			className={className}
			{...a11y}
		>
			<title>Patrick Logo</title>
			<g transform="translate(-268,-78)">
				<path d={CELLS.tl} fill={GREEN} />
				<path d={CELLS.tr} fill={GREEN} />
				<path d={CELLS.bl} fill={GREEN} />
				<path d={CELLS.br} fill={CORAL} />
			</g>
		</svg>
	);
}
