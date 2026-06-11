import { useEffect, useRef, useState } from "react";

// Fires once when the element first scrolls into view, then disconnects. Drives
// section reveals and the clover dividers' draw-in.
export function useInView<T extends Element>(threshold = 0.25) {
	const ref = useRef<T>(null);
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting) {
					setInView(true);
					observer.disconnect();
				}
			},
			{ threshold },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [threshold]);

	return { ref, inView };
}
