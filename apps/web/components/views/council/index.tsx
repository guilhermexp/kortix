"use client"

import { BACKEND_URL } from "@lib/env"
import { cn } from "@lib/utils"
import { Button } from "@ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/components/dialog"
import { ScrollArea } from "@ui/components/scroll-area"
import { formatDistanceToNow } from "date-fns"
import {
	Bot,
	ChevronDown,
	ChevronRight,
	Copy,
	HistoryIcon,
	ListTree,
	Plus,
	Square,
	X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Streamdown } from "streamdown"
import { Response } from "@/components/ai-elements/response"
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group"
import { Spinner } from "../../spinner"
import { ChatModeSelector } from "../chat/chat-mode-selector"

type CouncilConversationMeta = {
	id: string
	created_at: string
	title: string
	message_count: number
	updated_at: string
}

type CouncilStage1 = {
	model: string
	response: string
}

type CouncilStage2 = {
	model: string
	ranking: string
	parsed_ranking: string[]
}

type CouncilStage3 = {
	model: string
	response: string
}

type CouncilAssistantMessage = {
	role: "assistant"
	created_at: string
	stage1?: CouncilStage1[] | null
	stage2?: CouncilStage2[] | null
	stage3?: CouncilStage3 | null
	metadata?: {
		label_to_model?: Record<string, string>
		aggregate_rankings?: Array<{
			model: string
			average_rank: number
			rankings_count: number
		}>
	} | null
	loading?: {
		stage1: boolean
		stage2: boolean
		stage3: boolean
	}
}

type CouncilUserMessage = {
	role: "user"
	content: string
	created_at: string
}

type CouncilMessage = CouncilUserMessage | CouncilAssistantMessage

type CouncilConversation = {
	id: string
	created_at: string
	title: string
	messages: CouncilMessage[]
}

function isAssistant(message: CouncilMessage): message is CouncilAssistantMessage {
	return message.role === "assistant"
}

function messageKey(message: CouncilMessage, index: number): string {
	return `${message.created_at}-${message.role}-${index}`
}

export function CouncilChat({
	compact = false,
	onClose,
	onSwitchToAgent,
}: {
	compact?: boolean
	onClose?: () => void
	onSwitchToAgent?: () => void
}) {
	const [conversations, setConversations] = useState<CouncilConversationMeta[]>([])
	const [conversationId, setConversationId] = useState<string | null>(null)
	const [conversation, setConversation] = useState<CouncilConversation | null>(null)
	const [isHistoryOpen, setIsHistoryOpen] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [input, setInput] = useState("")
	const [expandedByMessage, setExpandedByMessage] = useState<Record<string, boolean>>(
		{},
	)
	const [error, setError] = useState<string | null>(null)
	const scrollRef = useRef<HTMLDivElement | null>(null)
	const bottomRef = useRef<HTMLDivElement | null>(null)
	const controllerRef = useRef<AbortController | null>(null)

	const sortedConversations = useMemo(
		() =>
			[...conversations].sort((a, b) =>
				a.updated_at < b.updated_at ? 1 : -1,
			),
		[conversations],
	)

	const scrollToBottom = useCallback(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
	}, [])

	const fetchConversations = useCallback(async (): Promise<CouncilConversationMeta[]> => {
		const response = await fetch(`${BACKEND_URL}/v3/council/conversations`, {
			credentials: "include",
		})
		if (!response.ok) {
			throw new Error("Failed to load council conversations")
		}
		const data = (await response.json()) as CouncilConversationMeta[]
		setConversations(data)
		return data
	}, [])

	const fetchConversation = useCallback(async (id: string) => {
		const response = await fetch(`${BACKEND_URL}/v3/council/conversations/${id}`, {
			credentials: "include",
		})
		if (!response.ok) {
			throw new Error("Failed to load council conversation")
		}
		const data = (await response.json()) as CouncilConversation
		setConversation(data)
	}, [])

	const createConversation = useCallback(async (): Promise<CouncilConversation> => {
		const response = await fetch(`${BACKEND_URL}/v3/council/conversations`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		})
		if (!response.ok) {
			throw new Error("Failed to create council conversation")
		}
		return (await response.json()) as CouncilConversation
	}, [])

	useEffect(() => {
		let cancelled = false
		void (async () => {
			try {
				const list = await fetchConversations()
				if (cancelled) return
				if (list.length > 0) {
					const first = list[0]
					if (first) {
						setConversationId(first.id)
						await fetchConversation(first.id)
					}
					return
				}
				const created = await createConversation()
				if (cancelled) return
				setConversationId(created.id)
				setConversation(created)
				await fetchConversations()
			} catch (loadError) {
				if (cancelled) return
				setError(loadError instanceof Error ? loadError.message : "Failed to load")
			}
		})()
		return () => {
			cancelled = true
		}
	}, [createConversation, fetchConversation, fetchConversations])

	useEffect(() => {
		scrollToBottom()
	}, [conversation, isLoading, scrollToBottom])

	const handleNewConversation = useCallback(async () => {
		try {
			setError(null)
			const created = await createConversation()
			setConversationId(created.id)
			setConversation(created)
			setExpandedByMessage({})
			await fetchConversations()
			setIsHistoryOpen(false)
		} catch (createError) {
			setError(
				createError instanceof Error
					? createError.message
					: "Failed to create conversation",
			)
		}
	}, [createConversation, fetchConversations])

	const handleSelectConversation = useCallback(
		async (id: string) => {
			setConversationId(id)
			setError(null)
			await fetchConversation(id)
			setIsHistoryOpen(false)
		},
		[fetchConversation],
	)

	const handleStop = useCallback(() => {
		controllerRef.current?.abort()
		controllerRef.current = null
		setIsLoading(false)
		if (conversationId) {
			void fetch(`${BACKEND_URL}/v3/council/conversations/${conversationId}/cancel`, {
				method: "POST",
				credentials: "include",
			})
		}
	}, [conversationId])

	const handleSend = useCallback(async () => {
		const content = input.trim()
		if (!content || isLoading) return

		setError(null)
		setInput("")

		let activeConversationId = conversationId
		let activeConversation = conversation
		if (!activeConversationId || !activeConversation) {
			const created = await createConversation()
			activeConversationId = created.id
			activeConversation = created
			setConversationId(created.id)
			setConversation(created)
		}
		if (!activeConversationId || !activeConversation) return

		const now = new Date().toISOString()
		const assistantPlaceholder: CouncilAssistantMessage = {
			role: "assistant",
			created_at: now,
			stage1: null,
			stage2: null,
			stage3: null,
			metadata: null,
			loading: { stage1: false, stage2: false, stage3: false },
		}

		setConversation((prev) => {
			const base =
				prev ??
				activeConversation ?? {
					id: activeConversationId,
					created_at: now,
					title: "Greeting",
					messages: [],
				}
			return {
				...base,
				messages: [
					...base.messages,
					{ role: "user", content, created_at: now },
					assistantPlaceholder,
				],
			}
		})
		setIsLoading(true)

		const controller = new AbortController()
		controllerRef.current = controller

		try {
			const response = await fetch(
				`${BACKEND_URL}/v3/council/conversations/${activeConversationId}/message/stream`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ content }),
					signal: controller.signal,
				},
			)

			if (!response.ok || !response.body) {
				throw new Error("Failed to start council stream")
			}

			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ""

			const updateLastAssistant = (
				updater: (message: CouncilAssistantMessage) => CouncilAssistantMessage,
			) => {
				setConversation((prev) => {
					if (!prev) return prev
					const messages = [...prev.messages]
					for (let index = messages.length - 1; index >= 0; index--) {
						const candidate = messages[index]
						if (!candidate || !isAssistant(candidate)) continue
						messages[index] = updater(candidate)
						break
					}
					return { ...prev, messages }
				})
			}

			const applyEvent = (event: Record<string, unknown>) => {
				const type = typeof event.type === "string" ? event.type : ""
				if (type === "stage1_start") {
					updateLastAssistant((msg) => ({
						...msg,
						loading: { ...(msg.loading ?? { stage1: false, stage2: false, stage3: false }), stage1: true },
					}))
					return
				}
				if (type === "stage1_complete") {
					updateLastAssistant((msg) => ({
						...msg,
						stage1: Array.isArray(event.data) ? (event.data as CouncilStage1[]) : [],
						loading: { ...(msg.loading ?? { stage1: false, stage2: false, stage3: false }), stage1: false },
					}))
					return
				}
				if (type === "stage2_start") {
					updateLastAssistant((msg) => ({
						...msg,
						loading: { ...(msg.loading ?? { stage1: false, stage2: false, stage3: false }), stage2: true },
					}))
					return
				}
				if (type === "stage2_complete") {
					updateLastAssistant((msg) => ({
						...msg,
						stage2: Array.isArray(event.data) ? (event.data as CouncilStage2[]) : [],
						metadata:
							typeof event.metadata === "object" && event.metadata
								? (event.metadata as CouncilAssistantMessage["metadata"])
								: msg.metadata,
						loading: { ...(msg.loading ?? { stage1: false, stage2: false, stage3: false }), stage2: false },
					}))
					return
				}
				if (type === "stage3_start") {
					updateLastAssistant((msg) => ({
						...msg,
						loading: { ...(msg.loading ?? { stage1: false, stage2: false, stage3: false }), stage3: true },
					}))
					return
				}
				if (type === "stage3_complete") {
					updateLastAssistant((msg) => ({
						...msg,
						stage3:
							typeof event.data === "object" && event.data
								? (event.data as CouncilStage3)
								: null,
						loading: { ...(msg.loading ?? { stage1: false, stage2: false, stage3: false }), stage3: false },
					}))
					return
				}
				if (type === "title_complete") {
					void fetchConversations()
				}
				if (type === "error") {
					const message =
						typeof event.message === "string"
							? event.message
							: "Council stream error"
					setError(message)
					return
				}
				if (type === "cancelled") {
					setError(null)
				}
			}

			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const events = buffer.split("\n\n")
				buffer = events.pop() ?? ""

				for (const eventChunk of events) {
					const lines = eventChunk.split("\n")
					for (const line of lines) {
						if (!line.startsWith("data: ")) continue
						const payload = line.slice(6)
						try {
							const parsed = JSON.parse(payload) as Record<string, unknown>
							applyEvent(parsed)
						} catch {
							// ignore malformed event chunks
						}
					}
				}
			}
			await fetchConversations()
			await fetchConversation(activeConversationId)
		} catch (streamError) {
			setError(
				streamError instanceof Error
					? streamError.message
					: "Failed to stream council response",
			)
		} finally {
			controllerRef.current = null
			setIsLoading(false)
		}
	}, [
		conversation,
		conversationId,
		createConversation,
		fetchConversation,
		fetchConversations,
		input,
		isLoading,
	])

	return (
		<div className="flex h-full flex-col bg-black">
			<div
				className={cn(
					"sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-black",
					compact ? "px-3 py-2" : "px-4 py-2.5",
				)}
			>
				<h3 className="truncate text-sm font-semibold text-zinc-100">
					{conversation?.title || "Greeting"}
				</h3>
				<div className="flex items-center gap-1">
					<Dialog onOpenChange={setIsHistoryOpen} open={isHistoryOpen}>
						<DialogTrigger asChild>
							<Button
								className="h-7 w-7 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
								size="icon"
								variant="ghost"
							>
								<HistoryIcon className="size-3.5" />
							</Button>
						</DialogTrigger>
						<DialogContent className="border-white/10 bg-[#090b10] text-zinc-100">
							<DialogHeader>
								<DialogTitle>Council Sessions</DialogTitle>
								<DialogDescription className="text-zinc-400">
									Retome sessões anteriores do council
								</DialogDescription>
							</DialogHeader>
							<ScrollArea className="max-h-80">
								<div className="space-y-1 pr-2">
									{sortedConversations.map((item) => {
										const isActive = item.id === conversationId
										return (
											<button
												className={cn(
													"w-full rounded-md border px-3 py-2 text-left transition-colors",
													isActive
														? "border-[#1f56d8] bg-[#0f1628]"
														: "border-white/10 bg-[#0b0d12] hover:bg-[#111521]",
												)}
												key={item.id}
												onClick={() => void handleSelectConversation(item.id)}
												type="button"
											>
												<div className="truncate text-sm font-medium">{item.title || "Untitled"}</div>
												<div className="text-xs text-zinc-400">
													Updated {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
												</div>
											</button>
										)
									})}
								</div>
							</ScrollArea>
						</DialogContent>
					</Dialog>
					<Button
						className="h-7 w-7 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
						onClick={() => void handleNewConversation()}
						size="icon"
						variant="ghost"
					>
						<Plus className="size-3.5" />
					</Button>
					{onClose ? (
						<Button
							className="h-7 w-7 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
							onClick={onClose}
							size="icon"
							variant="ghost"
						>
							<X className="size-3.5" />
						</Button>
					) : null}
				</div>
			</div>

			<div className={cn("flex-1 overflow-y-auto", compact ? "px-3 py-3" : "px-4 py-4")} ref={scrollRef}>
				{conversation?.messages.length ? (
					<div className="space-y-4">
						{conversation.messages.map((message, index) => {
							const key = messageKey(message, index)
							if (message.role === "user") {
								return (
									<div className="flex justify-end" key={key}>
										<div className="max-w-[92%] rounded-2xl border border-white/10 bg-[#0b0c10] px-4 py-2.5 text-zinc-100">
											{message.content}
										</div>
									</div>
								)
							}

							const assistant = message
							const stepsCount =
								(assistant.stage1?.length ?? 0) +
								(assistant.stage2?.length ?? 0) +
								(assistant.stage3 ? 1 : 0)
							const expanded = expandedByMessage[key] ?? isLoading

							return (
								<div className="space-y-2" key={key}>
									{stepsCount > 0 || assistant.loading?.stage1 || assistant.loading?.stage2 || assistant.loading?.stage3 ? (
										<div className="rounded-xl border border-white/10 bg-[#090b10]">
											<button
												className="flex w-full items-center justify-between px-3 py-2 text-xs text-zinc-400 hover:bg-white/5"
												onClick={() =>
													setExpandedByMessage((prev) => ({ ...prev, [key]: !expanded }))
												}
												type="button"
											>
												<span className="inline-flex items-center gap-1.5">
													<ListTree className="size-3.5" />
													{Math.max(stepsCount, 1)} steps
													{(assistant.stage1?.length ?? 0) > 0 ? (
														<span className="text-zinc-500">• {assistant.stage1?.length} sub-agents</span>
													) : null}
												</span>
												{expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
											</button>
											{expanded ? (
												<div className="space-y-2 border-t border-white/10 px-3 py-2">
													{assistant.loading?.stage1 ? (
														<div className="flex items-center gap-2 text-xs text-zinc-400">
															<Spinner className="size-3" /> Thinking • stage 1
														</div>
													) : null}
													{assistant.stage1?.map((item) => (
														<div className="rounded-lg border border-white/10 bg-[#0d1017] px-3 py-2" key={`${key}-${item.model}`}>
															<div className="text-xs font-medium text-zinc-300">Completed subagent</div>
															<div className="truncate text-xs text-zinc-500">{item.model}</div>
														</div>
													))}
													{assistant.loading?.stage2 ? (
														<div className="flex items-center gap-2 text-xs text-zinc-400">
															<Spinner className="size-3" /> Thinking • stage 2
														</div>
													) : null}
													{assistant.metadata?.aggregate_rankings?.length ? (
														<div className="rounded-lg border border-white/10 bg-[#0d1017] px-3 py-2">
															<div className="mb-2 text-xs font-medium text-zinc-300">Aggregate ranking</div>
															<div className="space-y-1">
																{assistant.metadata.aggregate_rankings.map((rank) => (
																	<div className="flex items-center justify-between text-xs" key={`${key}-${rank.model}`}>
																		<span className="truncate text-zinc-300">{rank.model}</span>
																		<span className="text-zinc-500">{rank.average_rank.toFixed(2)}</span>
																	</div>
																))}
															</div>
														</div>
													) : null}
													{assistant.loading?.stage3 ? (
														<div className="flex items-center gap-2 text-xs text-zinc-400">
															<Spinner className="size-3" /> Thinking • stage 3
														</div>
													) : null}
												</div>
											) : null}
										</div>
									) : null}

									{assistant.stage3?.response ? (
										<div className="space-y-2">
											<div className="h-px w-full bg-white/10" />
											<div className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Response</div>
											<Response>
												<Streamdown>{assistant.stage3.response}</Streamdown>
											</Response>
											<div className="flex items-center gap-1 px-1">
												<Button
													className="size-7 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
													onClick={() => {
														navigator.clipboard.writeText(assistant.stage3?.response ?? "")
														toast.success("Copied")
													}}
													size="icon"
													variant="ghost"
												>
													<Copy className="size-3.5" />
												</Button>
											</div>
										</div>
									) : null}
								</div>
							)
						})}
					</div>
				) : (
					<div className="flex h-full items-center justify-center px-4 text-center text-sm text-zinc-500">
						<div>
							<div className="mb-2 flex items-center justify-center">
								<Bot className="size-5" />
							</div>
							<div>Start a council session</div>
						</div>
					</div>
				)}

				{error ? <div className="mt-3 text-xs text-red-400">{error}</div> : null}
				<div ref={bottomRef} />
			</div>

			<form
				className={cn("relative bg-black", compact ? "px-2.5 pb-2.5 pt-1" : "px-6 pb-3 pt-1")}
				onSubmit={(event) => {
					event.preventDefault()
					void handleSend()
				}}
			>
				{isLoading ? (
					<div className="mb-1.5 flex items-center justify-between rounded-3xl border border-white/10 bg-[#080a0f] px-5 py-3">
						<span className="text-[16px] leading-none font-medium text-zinc-400">Generating..</span>
						<button
							className="inline-flex items-center gap-2 text-zinc-100 hover:text-white"
							onClick={handleStop}
							type="button"
						>
							<span className="text-[16px] leading-none font-medium">Stop</span>
							<span className="text-[13px] leading-none text-zinc-500">^C</span>
						</button>
					</div>
				) : null}
				<InputGroup className="rounded-3xl border border-[#1f56d8] bg-[#07090d] shadow-[0_0_0_1px_rgba(31,86,216,0.35)] transition-colors focus-within:border-[#2f67f2]">
					<InputGroupTextarea
						className={cn(
							"min-h-[96px] px-4 pt-3 pb-10 text-zinc-100 placeholder-zinc-500",
							compact ? "text-[13px]" : "text-sm",
						)}
						disabled={isLoading}
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault()
								void handleSend()
							}
						}}
						placeholder={isLoading ? "Add to the queue" : "Plan, @ for context, / for commands"}
						value={input}
					/>
					<InputGroupAddon align="inline-start" className="bottom-0 gap-1">
						<div className="ml-2 mb-2 flex items-center gap-1 text-zinc-400">
							<ChatModeSelector
								mode="council"
								onSelectMode={(mode) => {
									if (mode === "agent") {
										onSwitchToAgent?.()
									}
								}}
							/>
						</div>
					</InputGroupAddon>
					<InputGroupAddon align="inline-end" className="bottom-0 gap-1">
						<InputGroupButton
							className="mb-2 h-8 w-8 rounded-lg border border-white/10 bg-[#050608] p-0 text-zinc-500 hover:bg-[#0a0c11] hover:text-zinc-200"
							disabled={!input.trim() || isLoading}
							size="sm"
							type="submit"
							variant="ghost"
						>
							{isLoading ? <Square className="size-3.5" /> : <ChevronRight className="size-3.5" />}
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			</form>
		</div>
	)
}
