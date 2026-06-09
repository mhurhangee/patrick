// Chats are still mocked — no chat persistence yet. Everything else (profiles,
// tasks, documents) is real.

export type MockChat = {
	id: string;
	title: string;
	preview: string;
	date: string;
	active?: boolean;
};

export const mockChats: MockChat[] = [
	{
		id: "c1",
		title: "Claim 1 amendment",
		preview: "Distinguish over Smith by adding the latch…",
		date: "2h",
		active: true,
	},
	{
		id: "c2",
		title: "§103 rejection analysis",
		preview: "The combination of Smith and Jones fails to…",
		date: "1d",
	},
];
