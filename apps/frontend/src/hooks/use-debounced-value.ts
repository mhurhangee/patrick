import { useEffect, useState } from "react";

/** Returns `value` delayed by `ms` — updates only after it stops changing. */
export function useDebouncedValue<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(id);
	}, [value, ms]);
	return debounced;
}
