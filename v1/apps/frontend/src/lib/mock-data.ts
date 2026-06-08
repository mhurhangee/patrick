export type MockProfile = {
	id: string;
	name: string;
	firm: string;
	initials: string;
	taskCount: number;
	lastUsed: string;
};

export const activeProfile: MockProfile = {
	id: "jane",
	name: "Jane Smith",
	firm: "Smith & Hale IP",
	initials: "JS",
	taskCount: 7,
	lastUsed: "2 hours ago",
};

export const mockProfiles: MockProfile[] = [
	activeProfile,
	{
		id: "ep",
		name: "EP Practice",
		firm: "European prosecution",
		initials: "EP",
		taskCount: 3,
		lastUsed: "yesterday",
	},
	{
		id: "acme",
		name: "Acme Legal",
		firm: "In-house counsel",
		initials: "AL",
		taskCount: 12,
		lastUsed: "3 days ago",
	},
];

export type MockTask = {
	id: string;
	title: string;
	reference: string;
	type: string;
	docCount: number;
	lastOpened: string;
};

export const activeTask: MockTask = {
	id: "t1",
	title: "Non-Final OA Response",
	reference: "US 17/123,456",
	type: "US Non-Final OA",
	docCount: 5,
	lastOpened: "2 hours ago",
};

export const mockTasks: MockTask[] = [
	activeTask,
	{
		id: "t2",
		title: "Art. 94(3) Response",
		reference: "EP 3 456 789",
		type: "EP Art. 94(3)",
		docCount: 4,
		lastOpened: "yesterday",
	},
	{
		id: "t3",
		title: "Final OA Response",
		reference: "US 16/987,654",
		type: "US Final OA",
		docCount: 6,
		lastOpened: "last week",
	},
];

export type MockSource = {
	id: string;
	filename: string;
	kind: "pdf" | "docx";
	signpost: string;
	tags: string[];
	open?: boolean;
	excluded?: boolean;
	starred?: boolean;
};

export const mockSources: MockSource[] = [
	{
		id: "s1",
		filename: "office-action.pdf",
		kind: "pdf",
		signpost: "Non-Final Office Action, mailed 14 Mar 2026.",
		tags: ["OA"],
		open: true,
		starred: true,
	},
	{
		id: "s2",
		filename: "specification.pdf",
		kind: "pdf",
		signpost: "Application as filed — specification and claims.",
		tags: ["spec"],
		open: true,
	},
	{
		id: "s3",
		filename: "smith-us7891234.pdf",
		kind: "pdf",
		signpost: "Smith — primary cited reference (§103).",
		tags: ["prior art"],
	},
	{
		id: "s4",
		filename: "jones-us8123456.pdf",
		kind: "pdf",
		signpost: "Jones — secondary cited reference.",
		tags: ["prior art"],
		excluded: true,
	},
];

export type MockArtifact = {
	id: string;
	title: string;
	open?: boolean;
	focused?: boolean;
};

export const mockArtifacts: MockArtifact[] = [
	{
		id: "a1",
		title: "Response to Office Action.docx",
		open: true,
		focused: true,
	},
];

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

export type MockProvider = { id: string; label: string };
export const mockProviders: MockProvider[] = [
	{ id: "anthropic", label: "Anthropic" },
	{ id: "openai", label: "OpenAI" },
	{ id: "google", label: "Google" },
	{ id: "gateway", label: "Vercel AI Gateway" },
];

export const mockModels = [
	{ id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
	{ id: "claude-opus-4-8", label: "Claude Opus 4.8" },
	{ id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];
