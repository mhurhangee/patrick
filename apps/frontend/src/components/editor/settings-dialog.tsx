"use client"

/* DEMO ONLY, DO NOT USE IN PRODUCTION */

import { CopilotPlugin } from "@platejs/ai/react"
import {
	Check,
	ChevronsUpDown,
	ExternalLinkIcon,
	Eye,
	EyeOff,
	Settings,
	Wand2Icon,
} from "lucide-react"
import { useEditorRef } from "platejs/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { aiChatPlugin } from "./plugins/ai-kit"

type Model = {
	label: string
	value: string
}

export const models: Model[] = [
	{ label: "Gemini 3.1 Flash Lite", value: "google/gemini-3.1-flash-lite" }
]

export function SettingsDialog() {
	const editor = useEditorRef()

	const [tempModel, setTempModel] = React.useState(models[0])
	const [tempKeys, setTempKeys] = React.useState<Record<string, string>>({
		aiGatewayApiKey: "",
		uploadthing: "",
	})
	const [showKey, setShowKey] = React.useState<Record<string, boolean>>({})
	const [open, setOpen] = React.useState(false)
	const [openModel, setOpenModel] = React.useState(false)

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()

		// Update AI chat options
		const chatOptions = editor.getOptions(aiChatPlugin).chatOptions ?? {}

		editor.setOption(aiChatPlugin, "chatOptions", {
			...chatOptions,
			body: {
				...chatOptions.body,
				apiKey: tempKeys.aiGatewayApiKey,
				model: tempModel.value,
			},
		})

		setOpen(false)

		// Update AI complete options
		const completeOptions =
			editor.getOptions(CopilotPlugin).completeOptions ?? {}
		editor.setOption(CopilotPlugin, "completeOptions", {
			...completeOptions,
			body: {
				...completeOptions.body,
				apiKey: tempKeys.aiGatewayApiKey,
				model: tempModel.value,
			},
		})
	}

	const toggleKeyVisibility = (key: string) => {
		setShowKey((prev) => ({ ...prev, [key]: !prev[key] }))
	}

	const renderApiKeyInput = (service: string, label: string) => (
		<div className="group relative">
			<div className="flex items-center justify-between">
				<label
					className="-translate-y-1/2 absolute top-1/2 block cursor-text px-1 text-muted-foreground/70 text-sm transition-all group-focus-within:pointer-events-none group-focus-within:top-0 group-focus-within:cursor-default group-focus-within:font-medium group-focus-within:text-foreground group-focus-within:text-xs has-[+input:not(:placeholder-shown)]:pointer-events-none has-[+input:not(:placeholder-shown)]:top-0 has-[+input:not(:placeholder-shown)]:cursor-default has-[+input:not(:placeholder-shown)]:font-medium has-[+input:not(:placeholder-shown)]:text-foreground has-[+input:not(:placeholder-shown)]:text-xs"
					htmlFor={label}
				>
					<span className="inline-flex bg-background px-2">{label}</span>
				</label>
				<Button
					asChild
					size="icon"
					variant="ghost"
					className="absolute top-0 right-[28px] h-full"
				>
					<a
						className="flex items-center"
						href={
							service === "aiGatewayApiKey"
								? "https://vercel.com/docs/ai-gateway"
								: "https://uploadthing.com/dashboard"
						}
						rel="noopener noreferrer"
						target="_blank"
					>
						<ExternalLinkIcon className="size-4" />
						<span className="sr-only">Get {label}</span>
					</a>
				</Button>
			</div>

			<Input
				id={label}
				className="pr-10"
				value={tempKeys[service]}
				onChange={(e) =>
					setTempKeys((prev) => ({ ...prev, [service]: e.target.value }))
				}
				placeholder=""
				data-1p-ignore
				type={showKey[service] ? "text" : "password"}
			/>
			<Button
				size="icon"
				variant="ghost"
				className="absolute top-0 right-0 h-full"
				onClick={() => toggleKeyVisibility(service)}
				type="button"
			>
				{showKey[service] ? (
					<EyeOff className="size-4" />
				) : (
					<Eye className="size-4" />
				)}
				<span className="sr-only">
					{showKey[service] ? "Hide" : "Show"} {label}
				</span>
			</Button>
		</div>
	)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					size="icon"
					variant="default"
					className={cn(
						"group fixed right-4 bottom-4 z-50 size-10 overflow-hidden",
						"rounded-full shadow-md hover:shadow-lg",
					)}
				// data-block-hide
				>
					<Settings className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="text-xl">Settings</DialogTitle>
					<DialogDescription>
						Configure your API keys and preferences.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-10" onSubmit={handleSubmit}>
					{/* AI Settings Group */}
					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<div className="size-8 rounded-full bg-purple-100 p-2 dark:bg-purple-900">
								<Wand2Icon className="size-4 text-purple-600 dark:text-purple-400" />
							</div>
							<h4 className="font-semibold">AI</h4>
						</div>

						<div className="space-y-4">
							{renderApiKeyInput("aiGatewayApiKey", "AI Gateway API Key")}

							<div className="group relative">
								<label
									className="-translate-y-1/2 absolute start-1 top-0 z-10 block bg-background px-2 font-medium text-foreground text-xs group-has-disabled:opacity-50"
									htmlFor="select-model"
								>
									Model
								</label>
								<Popover open={openModel} onOpenChange={setOpenModel}>
									<PopoverTrigger id="select-model" asChild>
										<Button
											size="lg"
											variant="outline"
											className="w-full justify-between"
											aria-expanded={openModel}
											role="combobox"
										>
											<code>{tempModel.label}</code>
											<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-full p-0">
										<Command>
											<CommandInput placeholder="Search model..." />
											<CommandEmpty>No model found.</CommandEmpty>
											<CommandList>
												<CommandGroup>
													{models.map((m) => (
														<CommandItem
															key={m.value}
															value={m.value}
															onSelect={() => {
																setTempModel(m)
																setOpenModel(false)
															}}
														>
															<Check
																className={cn(
																	"mr-2 size-4",
																	tempModel.value === m.value
																		? "opacity-100"
																		: "opacity-0",
																)}
															/>
															<code>{m.label}</code>
														</CommandItem>
													))}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						</div>
					</div>

					{/* Upload Settings Group */}
					{/* <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-full bg-red-100 p-2 dark:bg-red-900">
                <Upload className="size-4 text-red-600 dark:text-red-400" />
              </div>
              <h4 className="font-semibold">Upload</h4>
            </div>

            <div className="space-y-4">
              {renderApiKeyInput('uploadthing', 'Uploadthing API key')}
            </div>
          </div> */}

					<Button size="lg" className="w-full" type="submit">
						Save changes
					</Button>
				</form>

				<p className="text-muted-foreground text-sm">
					Not stored anywhere. Used only for current session requests.
				</p>
			</DialogContent>
		</Dialog>
	)
}
