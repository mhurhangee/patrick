import { Clover } from "lucide-react"

type LogoProps = {
	size?: number
}

export function Logo({ size = 16 }: LogoProps) {
	return (
		<div className="bg-gradient-to-br from-primary to-primary/70 rounded-md p-1 inline-flex">
			<Clover className="text-primary-foreground" size={size} />
		</div>
	)
}
