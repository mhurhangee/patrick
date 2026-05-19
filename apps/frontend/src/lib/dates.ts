export function formatShortDate(date: string): string {
	if (!date) return ""
	const d = new Date(`${date}T00:00:00`)
	const month = d.toLocaleDateString("en-US", { month: "short" })
	const year = d.toLocaleDateString("en-US", { year: "2-digit" })
	return `${month} '${year}`
}

export function formatDisplayDate(date: string): string {
	if (!date) return "Pick a date"
	const d = new Date(`${date}T00:00:00`)
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
}
