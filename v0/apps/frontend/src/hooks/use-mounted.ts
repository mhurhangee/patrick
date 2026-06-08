import { useSyncExternalStore } from "react"

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function useMounted() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
