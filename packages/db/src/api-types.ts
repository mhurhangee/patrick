import type { InferSelectModel } from "drizzle-orm"
import type { assets, chatMessages, chats, projects, settings } from "./schema"

type SerialiseDate<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] }

export type ApiAsset = SerialiseDate<
	Omit<InferSelectModel<typeof assets>, "data">
>

export type ApiProject = SerialiseDate<InferSelectModel<typeof projects>>

export type ApiChat = SerialiseDate<InferSelectModel<typeof chats>>

export type ApiSettings = Omit<InferSelectModel<typeof settings>, "id">

export type ApiChatMessage = Omit<
	SerialiseDate<InferSelectModel<typeof chatMessages>>,
	"parts" | "metadata"
> & {
	parts: unknown[]
	metadata: Record<string, unknown>
}
