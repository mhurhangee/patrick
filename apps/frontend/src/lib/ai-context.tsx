import * as React from "react"

type AIContextValue = {
	connectedToAI: boolean
	connectedBYOK: boolean
}

const AIContext = React.createContext<AIContextValue>({
	connectedToAI: false,
	connectedBYOK: false,
})

export function AIProvider({
	children,
	apiKey,
}: {
	children: React.ReactNode
	apiKey: string
}) {
	const connectedBYOK = !!apiKey
	// connectedLocal and connectedCloud will extend this in future
	const connectedToAI = connectedBYOK

	return (
		<AIContext.Provider value={{ connectedToAI, connectedBYOK }}>
			{children}
		</AIContext.Provider>
	)
}

export function useAI() {
	return React.useContext(AIContext)
}
