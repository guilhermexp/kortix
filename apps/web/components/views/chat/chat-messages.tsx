"use client"

import { BACKEND_URL } from "@lib/env"
import { cn } from "@lib/utils"
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants"
import { Button } from "@ui/components/button"
import { Input } from "@ui/components/input"
// Select components removed - no longer needed with Claude Agent SDK
import {
	ArrowUp,
	Check,
	ChevronDown,
	ChevronRight,
	Copy,
	Info,
	Loader2,
	Plus,
	RotateCcw,
	Search,
	X,
} from "lucide-react"
import type { ReactNode } from "react"
import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { toast } from "sonner"
import { Streamdown } from "streamdown"
import {
	CodeBlock,
	CodeBlockCopyButton,
} from "@/components/ai-elements/code-block"
import { Response } from "@/components/ai-elements/response"
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolOutput,
} from "@/components/ai-elements/tool"
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group"
import { useCanvasAgentOptional } from "@/components/canvas/canvas-agent-provider"
import { useChatMentionQueue, useChatOpen, usePersistentChat, useProject } from "@/stores"
import { useCanvasSelection, useCanvasState } from "@/stores/canvas"
import { useGraphHighlights } from "@/stores/highlights"
import { useViewMode } from "@/lib/view-mode-context"
import { Spinner } from "../../spinner"
import {
	type ProviderId,
	ProviderSelector,
	useProviderSelection,
} from "./provider-selector"

interface MemoryResult {
	documentId?: string
	title?: string
	content?: string
	url?: string
	score?: number
}

interface ExpandableMemoriesProps {
	foundCount: number
	results: MemoryResult[]
}

type ToolState =
	| "input-available"
	| "input-streaming"
	| "output-available"
	| "output-error"

type TextPart = {
	type: "text"
	text: string
}

type SearchMemoriesPart =
	| {
			type: "tool-searchMemories"
			toolUseId?: string
			state: Exclude<ToolState, "output-available">
			error?: string
			durationMs?: number
	  }
	| {
			type: "tool-searchMemories"
			toolUseId?: string
			state: "output-available"
			output: {
				count?: unknown
				results?: unknown
			}
			error?: string
			durationMs?: number
	  }

type SearchMemoriesOutputPart = Extract<
	SearchMemoriesPart,
	{ state: "output-available" }
>

type GenericToolPart = {
	type: "tool-generic"
	toolName: string
	toolUseId?: string
	state: ToolState
	outputText?: string
	error?: string
	durationMs?: number
}

type AddMemoryPart = {
	type: "tool-addMemory"
	toolUseId?: string
	state: ToolState
}

type MentionedDocsPart = {
	type: "mentioned-docs"
	docIds: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function isTextPart(part: unknown): part is TextPart {
	return isObject(part) && part.type === "text" && typeof part.text === "string"
}

function isToolState(value: unknown): value is ToolState {
	return (
		typeof value === "string" &&
		[
			"input-available",
			"input-streaming",
			"output-available",
			"output-error",
		].includes(value)
	)
}

function isSearchMemoriesPart(part: unknown): part is SearchMemoriesPart {
	return (
		isObject(part) &&
		part.type === "tool-searchMemories" &&
		isToolState(part.state)
	)
}

function isSearchMemoriesOutputPart(
	part: unknown,
): part is SearchMemoriesOutputPart {
	return (
		isSearchMemoriesPart(part) &&
		part.state === "output-available" &&
		"output" in part &&
		isObject(part.output ?? null)
	)
}

function isAddMemoryPart(part: unknown): part is AddMemoryPart {
	return (
		isObject(part) && part.type === "tool-addMemory" && isToolState(part.state)
	)
}

function isGenericToolPart(part: unknown): part is GenericToolPart {
	return (
		isObject(part) &&
		part.type === "tool-generic" &&
		isToolState((part as GenericToolPart).state) &&
		typeof (part as GenericToolPart).toolName === "string"
	)
}

function isMentionedDocsPart(part: unknown): part is MentionedDocsPart {
	return (
		isObject(part) &&
		part.type === "mentioned-docs" &&
		Array.isArray(part.docIds) &&
		part.docIds.every((id) => typeof id === "string" && id.length > 0)
	)
}

function toMemoryResult(value: unknown): MemoryResult | null {
	if (!isObject(value)) return null
	const { documentId, title, content, url, score } = value
	const parsedScore =
		typeof score === "number"
			? score
			: typeof score === "string"
				? Number.parseFloat(score)
				: undefined
	return {
		documentId: typeof documentId === "string" ? documentId : undefined,
		title: typeof title === "string" ? title : undefined,
		content: typeof content === "string" ? content : undefined,
		url: typeof url === "string" ? url : undefined,
		score: Number.isFinite(parsedScore) ? parsedScore : undefined,
	}
}

function toMemoryResults(value: unknown): MemoryResult[] {
	if (!Array.isArray(value)) return []
	return value
		.map((item) => toMemoryResult(item))
		.filter((item): item is MemoryResult => item !== null)
}

function ExpandableMemories({ foundCount, results }: ExpandableMemoriesProps) {
	const [isExpanded, setIsExpanded] = useState(false)

	if (foundCount === 0) {
		return (
			<div className="text-sm flex items-center gap-2 text-muted-foreground">
				<Check className="size-4" /> No memories found
			</div>
		)
	}

	return (
		<div className="text-sm">
			<button
				className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				{isExpanded ? (
					<ChevronDown className="size-4" />
				) : (
					<ChevronRight className="size-4" />
				)}
				<Check className="size-4" />
				Found {foundCount} {foundCount === 1 ? "memory" : "memories"}
			</button>

			{isExpanded && results.length > 0 && (
				<div className="mt-3 ml-6 space-y-2.5 max-h-64 overflow-y-auto pr-2">
					{results.map((result, index) => {
						const isClickable =
							result.url &&
							(result.url.startsWith("http://") ||
								result.url.startsWith("https://"))

						const content = (
							<>
								{result.title && (
									<div className="font-semibold text-sm mb-1.5 text-foreground">
										{result.title}
									</div>
								)}
								{result.content && (
									<div className="text-xs text-muted-foreground/90 line-clamp-3 leading-relaxed mb-2">
										{result.content}
									</div>
								)}
								<div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border">
									{result.url && (
										<div className="text-xs text-primary truncate flex-1">
											{result.url}
										</div>
									)}
									{result.score && (
										<div className="text-xs text-muted-foreground font-mono shrink-0">
											{(result.score * 100).toFixed(0)}%
										</div>
									)}
								</div>
							</>
						)

						if (isClickable) {
							return (
								<a
									className="block p-3 bg-muted/80 rounded-md border border-border hover:bg-muted hover:border-border/80 transition-colors cursor-pointer"
									href={result.url}
									key={result.documentId || index}
									rel="noopener noreferrer"
									target="_blank"
								>
									{content}
								</a>
							)
						}

						return (
							<div
								className="p-3 bg-muted/80 rounded-md border border-border"
								key={result.documentId || index}
							>
								{content}
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

type TextSegment =
	| { type: "text"; content: string }
	| { type: "code"; content: string; language?: string | null }

function splitTextIntoSegments(text: string): TextSegment[] {
	const segments: TextSegment[] = []
	const fenceRegex = /```([\w+-]+)?\n([\s\S]*?)```/g
	let lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = fenceRegex.exec(text)) !== null) {
		const [rawMatch, language, codeContent] = match
		const matchIndex = match.index ?? 0
		if (matchIndex > lastIndex) {
			segments.push({
				type: "text",
				content: text.slice(lastIndex, matchIndex),
			})
		}
		segments.push({
			type: "code",
			content: codeContent ?? "",
			language: language ?? undefined,
		})
		lastIndex = matchIndex + rawMatch.length
	}

	if (lastIndex < text.length) {
		segments.push({ type: "text", content: text.slice(lastIndex) })
	}

	if (segments.length === 0) {
		return [{ type: "text", content: text }]
	}

	return segments
}

function buildToolType(toolName?: string | null, toolUseId?: string): string {
	const base =
		toolName && toolName.length > 0 ? toolName : (toolUseId ?? "generic")
	const normalized = base
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[^a-zA-Z0-9_]+/g, "_")
		.replace(/__+/g, "_")
		.trim()
		.toLowerCase()
	return `tool-${normalized.length > 0 ? normalized : "generic"}`
}

function formatDuration(duration?: number) {
	if (!duration || Number.isNaN(duration)) return null
	if (duration < 1000) return `${Math.round(duration)} ms`
	return `${(duration / 1000).toFixed(1)} s`
}

interface ToolCardProps {
	type: string
	state: ToolState
	durationMs?: number
	loadingMessage?: ReactNode
	successMessage?: ReactNode
	errorMessage?: string
	children?: ReactNode
}

function ToolCard({
	type,
	state,
	durationMs,
	loadingMessage,
	successMessage,
	errorMessage,
	children,
}: ToolCardProps) {
	const isLoading = state === "input-streaming" || state === "input-available"
	const isSuccess = state === "output-available"
	const isError = state === "output-error"
	const durationLabel = formatDuration(durationMs)

	const resolvedLoading =
		typeof loadingMessage === "string" ? (
			<span className="flex items-center gap-2 text-xs text-muted-foreground">
				<Spinner className="size-3" /> {loadingMessage}
			</span>
		) : (
			loadingMessage
		)

	const outputNode = (() => {
		if (isError) return null
		if (children) return children
		if (isLoading) return resolvedLoading ?? null
		return successMessage ?? null
	})()

	const hasContent = Boolean(
		durationLabel || resolvedLoading || successMessage || children,
	)
	const shouldRenderContent = hasContent || isError

	return (
		<Tool
			className="border-border/30 bg-background/5 backdrop-blur-xl"
			defaultOpen={isSuccess || isError}
		>
			<ToolHeader state={state} type={type} />
			{shouldRenderContent && (
				<ToolContent>
					{durationLabel && (
						<p className="text-[11px] uppercase text-muted-foreground/70">
							Duração: {durationLabel}
						</p>
					)}
					<ToolOutput
						errorText={
							isError
								? (errorMessage ?? "Falha ao executar a ferramenta")
								: undefined
						}
						output={isError ? undefined : outputNode}
					/>
				</ToolContent>
			)}
		</Tool>
	)
}

function useStickyAutoScroll(triggerKeys: ReadonlyArray<unknown>) {
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const bottomRef = useRef<HTMLDivElement>(null)
	const [isAutoScroll, setIsAutoScroll] = useState(true)
	const [isFarFromBottom, setIsFarFromBottom] = useState(false)

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
		const node = bottomRef.current
		if (node) node.scrollIntoView({ behavior, block: "end" })
	}, [])

	useEffect(function observeBottomVisibility() {
		const container = scrollContainerRef.current
		const sentinel = bottomRef.current
		if (!container || !sentinel) return

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries || entries.length === 0) return
				const isIntersecting = entries.some((e) => e.isIntersecting)
				setIsAutoScroll(isIntersecting)
			},
			{ root: container, rootMargin: "0px 0px 80px 0px", threshold: 0 },
		)
		observer.observe(sentinel)
		return () => observer.disconnect()
	}, [])

	useEffect(
		function observeContentResize() {
			const container = scrollContainerRef.current
			if (!container) return
			const resizeObserver = new ResizeObserver(() => {
				if (isAutoScroll) scrollToBottom("auto")
				const distanceFromBottom =
					container.scrollHeight - container.scrollTop - container.clientHeight
				setIsFarFromBottom(distanceFromBottom > 100)
			})
			resizeObserver.observe(container)
			return () => resizeObserver.disconnect()
		},
		[isAutoScroll, scrollToBottom],
	)

	function enableAutoScroll() {
		setIsAutoScroll(true)
	}

	useEffect(
		function autoScrollOnNewContent() {
			if (isAutoScroll) scrollToBottom("auto")
		},
		[isAutoScroll, scrollToBottom, ...triggerKeys],
	)

	const recomputeDistanceFromBottom = useCallback(() => {
		const container = scrollContainerRef.current
		if (!container) return
		const distanceFromBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight
		setIsFarFromBottom(distanceFromBottom > 100)
	}, [])

	useEffect(() => {
		recomputeDistanceFromBottom()
	}, [recomputeDistanceFromBottom, ...triggerKeys])

	const onScroll = useCallback(() => {
		recomputeDistanceFromBottom()
	}, [recomputeDistanceFromBottom])

	return {
		scrollContainerRef,
		bottomRef,
		isAutoScroll,
		isFarFromBottom,
		onScroll,
		enableAutoScroll,
		scrollToBottom,
	} as const
}

type ClaudeChatMessage = {
	id: string
	role: "user" | "assistant"
	content: string
	parts: Array<
		| TextPart
		| SearchMemoriesPart
		| AddMemoryPart
		| GenericToolPart
		| MentionedDocsPart
		| unknown
	>
}

type ClaudeChatStatus = "ready" | "submitted" | "streaming"

type ClaudeChatOptions = {
	conversationId?: string | null
	endpoint: string
	buildRequestBody: (
		userMessage: string,
		sdkSessionId: string | null,
		continueSession: boolean,
	) => Record<string, unknown>
	onComplete?: (payload: {
		text: string
		messages: ClaudeChatMessage[]
	}) => void
	onConversationId?: (conversationId: string) => void
	onSdkSessionId?: (sdkSessionId: string) => void
	getSdkSessionId?: (chatId?: string) => string | null | undefined
}

type SendMessagePayload = { text: string; mentionedDocIds?: string[] }

type RegeneratePayload = { messageId?: string }

function generateMessageId() {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID()
	}
	return `msg_${Math.random().toString(36).slice(2)}`
}

function createTextMessage(
	role: "user" | "assistant",
	content: string,
): ClaudeChatMessage {
	return {
		id: generateMessageId(),
		role,
		content,
		parts: [{ type: "text", text: content }],
	}
}

function areClaudeMessagesEqual(
	a: ClaudeChatMessage[],
	b: ClaudeChatMessage[],
) {
	if (a === b) return true
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i += 1) {
		const left = a[i]
		const right = b[i]
		if (!left || !right) return false
		if (
			left.id !== right.id ||
			left.role !== right.role ||
			left.content !== right.content
		) {
			return false
		}
		const leftParts = Array.isArray(left.parts) ? left.parts : []
		const rightParts = Array.isArray(right.parts) ? right.parts : []
		if (leftParts.length !== rightParts.length) {
			return false
		}
		for (let j = 0; j < leftParts.length; j += 1) {
			const lp = leftParts[j]
			const rp = rightParts[j]
			if (JSON.stringify(lp) !== JSON.stringify(rp)) {
				return false
			}
		}
	}
	return true
}

function useClaudeChat({
	conversationId,
	endpoint,
	buildRequestBody,
	onComplete,
	onConversationId,
	onSdkSessionId,
	getSdkSessionId,
}: ClaudeChatOptions) {
	const [messagesState, setMessagesState] = useState<ClaudeChatMessage[]>([])
	const [status, setStatus] = useState<ClaudeChatStatus>("ready")
	const [isThinking, setIsThinking] = useState(false)
	const abortRef = useRef<AbortController | null>(null)
	const messagesRef = useRef<ClaudeChatMessage[]>(messagesState)
	const conversationRef = useRef<string>(
		conversationId && conversationId.length > 0
			? conversationId
			: `claude-${Date.now()}`,
	)

	// Session management state
	const sdkSessionIdRef = useRef<string | null>(null)
	const lastMessageTimeRef = useRef<number>(0)
	const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

	// Canvas agent integration
	const canvasAgent = useCanvasAgentOptional()

	useEffect(() => {
		console.log("========================================")
		console.log("[Chat Hook] Conversation ID changed:", conversationId)
		if (conversationId && conversationId.length > 0) {
			conversationRef.current = conversationId
			// Carregar sdkSessionId salvo da conversa
			if (getSdkSessionId) {
				const savedSessionId = getSdkSessionId(conversationId)
				console.log("[Chat Hook] Checking for saved SDK session...")
				console.log("[Chat Hook] Saved SDK session ID:", savedSessionId)
				if (savedSessionId) {
					sdkSessionIdRef.current = savedSessionId
					lastMessageTimeRef.current = 0 // Reset tempo para forçar resume ao invés de continue
					console.log("✅ [Frontend Session] Loaded SDK session ID:", savedSessionId)
					console.log("✅ [Frontend Session] Will use RESUME mode on next message")
				} else {
					sdkSessionIdRef.current = null
					lastMessageTimeRef.current = 0
					console.log("⚠️ [Frontend Session] No SDK session ID found for this conversation")
					console.log("⚠️ [Frontend Session] Will create NEW session on next message")
				}
			}
		} else {
			// Nova conversa - reset session
			sdkSessionIdRef.current = null
			lastMessageTimeRef.current = 0
			console.log("🆕 [Frontend Session] New conversation - will create NEW session")
		}
		console.log("========================================")
	}, [conversationId, getSdkSessionId])

	// Reset session when scoped documents change (user switches document context)
	const { scopedDocumentIds } = useCanvasSelection()
	const scopedIdsKey = JSON.stringify(scopedDocumentIds.sort())
	useEffect(() => {
		if (sdkSessionIdRef.current !== null) {
			sdkSessionIdRef.current = null
			lastMessageTimeRef.current = 0
			console.log("[Frontend Session] Session reset due to document context change")
		}
	}, [scopedIdsKey])

	useEffect(() => {
		messagesRef.current = messagesState
	}, [messagesState])

	// Limit messages in memory to prevent memory leaks in long conversations
	useEffect(() => {
		const MAX_MESSAGES_IN_MEMORY = 100
		if (messagesState.length > MAX_MESSAGES_IN_MEMORY) {
			console.warn(
				`[Chat] Message count (${messagesState.length}) exceeds limit. Trimming to last ${MAX_MESSAGES_IN_MEMORY} messages.`,
			)
			// Keep only the most recent messages
			const trimmed = messagesState.slice(-MAX_MESSAGES_IN_MEMORY)
			setMessagesState(trimmed)
			messagesRef.current = trimmed
		}
	}, [messagesState])

	const setMessages = useCallback(
		(
			updater:
				| ClaudeChatMessage[]
				| ((previous: ClaudeChatMessage[]) => ClaudeChatMessage[]),
		) => {
			setMessagesState((prev) => {
				const candidate =
					typeof updater === "function"
						? (updater as (value: ClaudeChatMessage[]) => ClaudeChatMessage[])(
								prev,
							)
						: updater
				const normalized = Array.isArray(candidate) ? candidate : prev
				if (Array.isArray(normalized) && Array.isArray(prev)) {
					if (areClaudeMessagesEqual(prev, normalized)) {
						messagesRef.current = prev
						return prev
					}
				}
				messagesRef.current = normalized
				return normalized
			})
		},
		[],
	)

	useEffect(() => {
		return () => {
			if (abortRef.current) {
				abortRef.current.abort()
			}
		}
	}, [])

	const stop = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort()
			abortRef.current = null
			setStatus("ready")
			setIsThinking(false)
			setMessages((prev) => {
				if (prev.length === 0) return prev
				const last = prev[prev.length - 1]
				if (last?.role === "assistant") {
					const textPart = Array.isArray(last.parts)
						? last.parts.find((part): part is TextPart =>
								Boolean(part && (part as any).type === "text"),
							)
						: undefined
					if (!textPart?.text) {
						return prev.slice(0, -1)
					}
				}
				return prev
			})
		}
	}, [setMessages])

	const sendMessage = useCallback(
		async ({ text, mentionedDocIds }: SendMessagePayload) => {
			const trimmed = text.trim()
			if (!trimmed || status !== "ready") {
				return
			}

			if (abortRef.current) {
				abortRef.current.abort()
			}

			const controller = new AbortController()
			abortRef.current = controller

			// Timeout de 5 minutos - aborta se não houver resposta
			const CHAT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutos
			const timeoutId = setTimeout(() => {
				console.log("[Chat] Request timeout after 5 minutes")
				controller.abort()
			}, CHAT_TIMEOUT_MS)

			const history = messagesRef.current.slice()
			const userMessage = createTextMessage("user", trimmed)
			if (Array.isArray(mentionedDocIds) && mentionedDocIds.length > 0) {
				const uniqueIds = [...new Set(mentionedDocIds)]
				userMessage.parts = [
					...userMessage.parts,
					{ type: "mentioned-docs", docIds: uniqueIds },
				]
			}
			const assistantPlaceholder = createTextMessage("assistant", "")
			const baseWithPlaceholder = [
				...history,
				userMessage,
				assistantPlaceholder,
			]
			setMessages(baseWithPlaceholder)
			setStatus("submitted")
			setIsThinking(true)

			// Calculate session continuity
			const now = Date.now()
			const timeSinceLastMessage = now - lastMessageTimeRef.current
			const hasRecentSession =
				sdkSessionIdRef.current !== null &&
				timeSinceLastMessage < SESSION_TIMEOUT_MS

			// Determine session mode: continue (< 30min) vs resume (> 30min with session) vs new (no session)
			const continueSession = hasRecentSession
			const sdkSessionId = continueSession ? null : sdkSessionIdRef.current

			console.log("========================================")
			console.log("📤 [Send Message] Preparing to send message...")
			console.log("[Frontend Session] Current state:", {
				currentSdkSessionId: sdkSessionIdRef.current,
				timeSinceLastMessage: `${Math.round(timeSinceLastMessage / 1000)}s`,
				sessionTimeout: `${SESSION_TIMEOUT_MS / 1000}s`,
				hasRecentSession,
			})
			console.log("[Frontend Session] Decision:", {
				mode: continueSession
					? "CONTINUE (recent session)"
					: sdkSessionId
						? "RESUME (old session)"
						: "NEW SESSION",
				continueSession,
				sdkSessionIdToSend: sdkSessionId,
			})

			try {
				const body = buildRequestBody(trimmed, sdkSessionId, continueSession)
				console.log("📦 [Send Message] Request body:", {
					...body,
					message: body.message?.substring(0, 50) + "...",
				})
				console.log("========================================")
				const response = await fetch(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify(body),
					signal: controller.signal,
				})
				if (!response.ok) {
					throw new Error(`Request failed with status ${response.status}`)
				}
				setStatus("streaming")

				const reader = response.body?.getReader()
				if (!reader) {
					throw new Error("Streaming not supported")
				}
				const decoder = new TextDecoder()
				let buffer = ""
				let assistantText = ""
				let finished = false
				let aborted = false

				const pushConversationId = (value: unknown) => {
					if (typeof value === "string" && value.length > 0) {
						if (conversationRef.current !== value) {
							conversationRef.current = value
						}
						if (onConversationId) {
							onConversationId(value)
						}
					}
				}

				const mutateAssistant = (
					updater: (message: ClaudeChatMessage) => ClaudeChatMessage,
				) => {
					setMessages((prev) => {
						if (prev.length === 0) return prev
						const next = [...prev]
						const lastIndex = next.length - 1
						const last = next[lastIndex]
						if (!last || last.role !== "assistant") {
							return next
						}
						next[lastIndex] = updater(last)
						return next
					})
				}

				const toolStartTimes = new Map<string, number>()

				const applyToolEvent = (eventRecord: Record<string, unknown>) => {
					const rawState =
						typeof eventRecord.state === "string" ? eventRecord.state : null
					if (
						!rawState ||
						![
							"input-available",
							"input-streaming",
							"output-available",
							"output-error",
						].includes(rawState)
					) {
						return
					}
					const toolState = rawState as ToolState
					const toolUseId =
						typeof eventRecord.toolUseId === "string"
							? eventRecord.toolUseId
							: undefined
					const toolName =
						typeof eventRecord.toolName === "string"
							? eventRecord.toolName
							: undefined
					const outputText =
						typeof eventRecord.outputText === "string"
							? eventRecord.outputText
							: undefined
					const errorText =
						typeof eventRecord.error === "string"
							? eventRecord.error
							: undefined
					let outputPayload =
						eventRecord.output && typeof eventRecord.output === "object"
							? (eventRecord.output as Record<string, unknown>)
							: null
					if (!outputPayload && outputText) {
						try {
							const parsedCandidate = JSON.parse(outputText)
							if (parsedCandidate && typeof parsedCandidate === "object") {
								outputPayload = parsedCandidate as Record<string, unknown>
							}
						} catch {
							// ignore parse errors for raw output text
						}
					}

					const now = Date.now()
					if (
						(toolState === "input-streaming" ||
							toolState === "input-available") &&
						toolUseId
					) {
						if (!toolStartTimes.has(toolUseId))
							toolStartTimes.set(toolUseId, now)
					}

					mutateAssistant((message) => {
						const existingParts = Array.isArray(message.parts)
							? [...message.parts]
							: []

						if (!existingParts.some((part) => isTextPart(part))) {
							existingParts.unshift({
								type: "text",
								text: message.content,
							} as TextPart)
						}

						const resolvedToolName =
							toolName ?? (toolUseId ? toolUseId : "tool")
						const isSearchTool =
							resolvedToolName === "mcp__supermemory-tools__searchDatabase"

						if (isSearchTool) {
							const existingIndex = existingParts.findIndex(
								(part) =>
									isSearchMemoriesPart(part) &&
									(toolUseId
										? part.toolUseId === toolUseId
										: part.state !== "output-available"),
							)
							const basePart: SearchMemoriesPart =
								existingIndex >= 0 &&
								isSearchMemoriesPart(existingParts[existingIndex])
									? { ...existingParts[existingIndex] }
									: {
											type: "tool-searchMemories",
											toolUseId,
											state: toolState,
										}
							basePart.toolUseId = toolUseId
							basePart.state = toolState
							if (
								toolUseId &&
								(toolState === "output-available" ||
									toolState === "output-error")
							) {
								const started = toolStartTimes.get(toolUseId)
								if (typeof started === "number") {
									basePart.durationMs = Math.max(0, now - started)
									toolStartTimes.delete(toolUseId)
								}
							}
							if (toolState === "output-available") {
								const parsedResults =
									outputPayload && Array.isArray(outputPayload.results)
										? toMemoryResults(outputPayload.results)
										: []
								const countValue =
									outputPayload && typeof outputPayload.count === "number"
										? outputPayload.count
										: parsedResults.length > 0
											? parsedResults.length
											: undefined
								basePart.output = {
									count: countValue,
									results: parsedResults,
								}
								basePart.error = undefined
							} else if (toolState === "output-error") {
								delete (basePart as Record<string, unknown>).output
								basePart.error =
									errorText ??
									(outputText && outputText.length > 0
										? outputText
										: "Tool execution failed")
							} else {
								delete (basePart as Record<string, unknown>).output
								basePart.error = undefined
							}
							if (existingIndex >= 0) {
								existingParts[existingIndex] = basePart
							} else {
								existingParts.push(basePart)
							}
						} else {
							const existingIndex = existingParts.findIndex(
								(part) =>
									isGenericToolPart(part) &&
									(toolUseId
										? part.toolUseId === toolUseId
										: part.toolName === resolvedToolName),
							)
							const basePart: GenericToolPart =
								existingIndex >= 0 &&
								isGenericToolPart(existingParts[existingIndex])
									? { ...existingParts[existingIndex] }
									: {
											type: "tool-generic",
											toolName: resolvedToolName,
											toolUseId,
											state: toolState,
										}
							basePart.toolUseId = toolUseId
							basePart.toolName = resolvedToolName
							basePart.state = toolState
							if (
								toolUseId &&
								(toolState === "output-available" ||
									toolState === "output-error")
							) {
								const started = toolStartTimes.get(toolUseId)
								if (typeof started === "number") {
									basePart.durationMs = Math.max(0, now - started)
									toolStartTimes.delete(toolUseId)
								}
							}
							if (toolState === "output-error") {
								basePart.error =
									errorText ??
									(outputText && outputText.length > 0
										? outputText
										: "Tool execution failed")
								basePart.outputText = undefined
							} else if (toolState === "output-available") {
								basePart.error = undefined
								basePart.outputText = outputText
							} else {
								basePart.error = undefined
								if (
									toolState === "input-streaming" ||
									toolState === "input-available"
								) {
									basePart.outputText = undefined
								}
							}
							if (existingIndex >= 0) {
								existingParts[existingIndex] = basePart
							} else {
								existingParts.push(basePart)
							}
						}

						return {
							...message,
							parts: existingParts as ClaudeChatMessage["parts"],
						}
					})
				}

				const updateAssistant = (content: string) => {
					setMessages((prev) => {
						if (prev.length === 0) return prev
						const next = [...prev]
						const lastIndex = next.length - 1
						const last = next[lastIndex]
						if (!last || last.role !== "assistant") {
							return next
						}
						const nextParts = Array.isArray(last.parts)
							? last.parts.map((part) =>
									typeof part === "object" && part !== null
										? { ...part }
										: part,
								)
							: []
						let textPart =
							nextParts.find((part): part is TextPart =>
								Boolean(
									part &&
										typeof part === "object" &&
										(part as any).type === "text",
								),
							) ?? null
						if (!textPart) {
							textPart = { type: "text", text: "" }
							nextParts.push(textPart)
						}
						textPart.text = content
						next[lastIndex] = {
							...last,
							content,
							parts: nextParts as ClaudeChatMessage["parts"],
						}
						return next
					})
				}

				const cancelReader = async () => {
					try {
						await reader.cancel()
					} catch {
						// ignore
					}
				}

				const buildFinalMessages = (
					assistantMessage: ClaudeChatMessage,
				): ClaudeChatMessage[] => {
					const current = messagesRef.current
					if (Array.isArray(current) && current.length > 0) {
						const base = [...current]
						const last = base[base.length - 1]
						if (last && last.id === assistantPlaceholder.id) {
							base.pop()
						} else if (last && last.role === "assistant") {
							base.pop()
						}
						return [...base, assistantMessage]
					}
					return [...history, userMessage, assistantMessage]
				}

				while (true) {
					const { value, done } = await reader.read().catch((error) => {
						if (controller.signal.aborted) {
							aborted = true
							return { value: undefined, done: true }
						}
						throw error
					})
					if (done) {
						if (buffer.trim().length > 0) {
							let payload: unknown
							try {
								payload = JSON.parse(buffer.trim())
							} catch {
								payload = null
							}
							buffer = ""
							if (payload && typeof payload === "object") {
								const record = payload as Record<string, unknown>
								console.log("[ChatMessages] Stream record received:", {
									type: record.type,
									hasMessage: !!record.message,
									hasParts: !!(record.message as any)?.parts,
								})
								if (record.type === "thinking") {
									if (typeof record.active === "boolean") {
										setIsThinking(Boolean(record.active))
									}
								} else if (record.type === "tool_event") {
									applyToolEvent(record)
									// Process canvas changes if this is a canvasApplyChanges tool
									const toolName = typeof record.toolName === "string" ? record.toolName : ""
									const outputText = typeof record.outputText === "string" ? record.outputText : ""
									const toolState = typeof record.state === "string" ? record.state : ""

									// Debug: log all tool events
									if (toolName.includes("canvas")) {
										console.log("[ChatMessages] Canvas tool event received:", {
											toolName,
											toolState,
											hasOutputText: !!outputText,
											outputTextLength: outputText?.length || 0,
											hasCanvasAgent: !!canvasAgent,
										})
									}

									if (
										toolName.includes("canvasApplyChanges") &&
										toolState === "output-available" &&
										outputText &&
										canvasAgent
									) {
										try {
											console.log("[ChatMessages] Processing canvas changes from tool:", toolName)
											console.log("[ChatMessages] Output text preview:", outputText.substring(0, 200))
											const applied = canvasAgent.processToolOutput(toolName, outputText)
											if (applied) {
												console.log("[ChatMessages] Canvas changes applied successfully")
											} else {
												console.warn("[ChatMessages] Canvas changes were not applied")
											}
										} catch (err) {
											console.error("[ChatMessages] Failed to apply canvas changes:", err)
										}
									} else if (toolName.includes("canvasApplyChanges")) {
										console.warn("[ChatMessages] Canvas tool conditions not met:", {
											toolName,
											toolState,
											hasOutputText: !!outputText,
											hasCanvasAgent: !!canvasAgent,
										})
									}
								} else if (record.type === "final") {
									const messagePayload =
										record.message && typeof record.message === "object"
											? (record.message as Record<string, unknown>)
											: null
									let finalText =
										messagePayload && typeof messagePayload.content === "string"
											? (messagePayload.content as string)
											: assistantText
									if (typeof finalText !== "string") {
										finalText = assistantText
									}
									const finalParts = Array.isArray(messagePayload?.parts)
										? (messagePayload?.parts as ClaudeChatMessage["parts"])
										: ([
												{ type: "text", text: finalText },
											] as ClaudeChatMessage["parts"])

									// Debug: log the final event for canvas debugging
									console.log("[ChatMessages] Final event received:", {
										hasCanvasAgent: !!canvasAgent,
										hasParts: Array.isArray(messagePayload?.parts),
										partsLength: Array.isArray(messagePayload?.parts) ? messagePayload.parts.length : 0,
										partsTypes: Array.isArray(messagePayload?.parts)
											? (messagePayload.parts as Array<Record<string, unknown>>).map(p => p?.type)
											: [],
									})

									// Process canvas tool parts from the final response
									if (Array.isArray(messagePayload?.parts)) {
										console.log("[ChatMessages] Processing parts array:", {
											length: messagePayload.parts.length,
											allParts: messagePayload.parts.map((p: Record<string, unknown>) => ({
												type: p?.type,
												toolName: p?.toolName,
												state: p?.state,
											})),
										})
										for (const part of messagePayload.parts as Array<Record<string, unknown>>) {
											// Debug: log each part
											if (part?.type === "tool-generic") {
												console.log("[ChatMessages] Found tool-generic part:", {
													toolName: part?.toolName,
													state: part?.state,
													hasOutputText: typeof part?.outputText === "string",
													outputTextPreview: typeof part?.outputText === "string"
														? (part.outputText as string).substring(0, 100)
														: null,
												})
											}

											if (
												part?.type === "tool-generic" &&
												typeof part?.toolName === "string" &&
												part.toolName.includes("canvasApplyChanges") &&
												part?.state === "output-available" &&
												typeof part?.outputText === "string"
											) {
												console.log("[ChatMessages] Processing canvas tool from final parts:", {
													toolName: part.toolName,
													outputTextLength: (part.outputText as string).length,
													hasCanvasAgent: !!canvasAgent,
												})

												if (!canvasAgent) {
													console.warn("[ChatMessages] Cannot apply canvas changes - canvasAgent is null")
													continue
												}

												try {
													const applied = canvasAgent.processToolOutput(part.toolName, part.outputText as string)
													if (applied) {
														console.log("[ChatMessages] Canvas changes applied successfully from final parts")
													} else {
														console.warn("[ChatMessages] Canvas changes were not applied from final parts")
													}
												} catch (err) {
													console.error("[ChatMessages] Failed to apply canvas changes from final parts:", err)
												}
											}
										}
									}
									const updatedAssistant = {
										...assistantPlaceholder,
										content: finalText,
										parts: finalParts,
									}
									const finalMessages = buildFinalMessages(updatedAssistant)
									setMessages(finalMessages)
									pushConversationId(record.conversationId)

									// Capture SDK session ID and update timestamp
									console.log("========================================")
									console.log("📥 [Stream] Received final event from backend")
									console.log("[Stream] SDK session ID in event:", record.sdkSessionId)
									if (
										typeof record.sdkSessionId === "string" &&
										record.sdkSessionId.length > 0
									) {
										sdkSessionIdRef.current = record.sdkSessionId
										lastMessageTimeRef.current = Date.now()
										console.log(
											"✅ [Frontend Session] Captured sdkSessionId:",
											record.sdkSessionId,
										)
										if (onSdkSessionId) {
											console.log("📞 [Stream] Calling onSdkSessionId callback...")
											onSdkSessionId(record.sdkSessionId)
										}
									} else {
										console.log("⚠️ [Stream] No SDK session ID in final event")
									}
									console.log("========================================")

									if (onComplete) {
										onComplete({ text: finalText, messages: finalMessages })
									}
									setIsThinking(false)
									finished = true
								}
							}
						}
						break
					}
					if (value) {
						buffer += decoder.decode(value, { stream: true })
					}

					let newlineIndex = buffer.indexOf("\n")
					while (newlineIndex !== -1) {
						const line = buffer.slice(0, newlineIndex).trim()
						buffer = buffer.slice(newlineIndex + 1)
						newlineIndex = buffer.indexOf("\n")
						if (!line) continue
						let payload: unknown
						try {
							payload = JSON.parse(line)
						} catch {
							continue
						}
						if (!payload || typeof payload !== "object") continue
						const record = payload as Record<string, unknown>
						const type = record.type

						if (type === "thinking") {
							if (typeof record.active === "boolean") {
								setIsThinking(Boolean(record.active))
							}
							continue
						}

						if (type === "tool_event") {
							applyToolEvent(record)
							continue
						}

						if (type === "assistant_delta" && typeof record.text === "string") {
							if (record.text.length > 0) {
								assistantText += record.text
								updateAssistant(assistantText)
							}
						} else if (type === "conversation") {
							pushConversationId(record.conversationId)
						} else if (type === "final") {
							const messagePayload =
								record.message && typeof record.message === "object"
									? (record.message as Record<string, unknown>)
									: null
							let finalText =
								messagePayload && typeof messagePayload.content === "string"
									? (messagePayload.content as string)
									: assistantText
							if (typeof finalText !== "string") {
								finalText = assistantText
							}
							const finalParts = Array.isArray(messagePayload?.parts)
								? (messagePayload?.parts as ClaudeChatMessage["parts"])
								: ([
										{ type: "text", text: finalText },
									] as ClaudeChatMessage["parts"])

							// Process canvas tool parts from the final response (STREAMING PATH)
							console.log("[ChatMessages] Final event received (streaming):", {
								hasCanvasAgent: !!canvasAgent,
								hasParts: Array.isArray(messagePayload?.parts),
								partsLength: Array.isArray(messagePayload?.parts) ? messagePayload.parts.length : 0,
							})
							if (Array.isArray(messagePayload?.parts) && canvasAgent) {
								console.log("[ChatMessages] Processing parts for canvas (streaming):", {
									length: messagePayload.parts.length,
									allParts: messagePayload.parts.map((p: Record<string, unknown>) => ({
										type: p?.type,
										toolName: p?.toolName,
										state: p?.state,
									})),
								})
								for (const part of messagePayload.parts as Array<Record<string, unknown>>) {
									if (
										part?.type === "tool-generic" &&
										typeof part?.toolName === "string" &&
										part.toolName.includes("canvasApplyChanges") &&
										part?.state === "output-available" &&
										typeof part?.outputText === "string"
									) {
										console.log("[ChatMessages] Applying canvas changes (streaming):", {
											toolName: part.toolName,
											outputTextLength: (part.outputText as string).length,
										})
										try {
											const applied = canvasAgent.processToolOutput(part.toolName, part.outputText as string)
											if (applied) {
												console.log("[ChatMessages] Canvas changes applied successfully (streaming)")
											} else {
												console.warn("[ChatMessages] Canvas changes were not applied (streaming)")
											}
										} catch (err) {
											console.error("[ChatMessages] Failed to apply canvas changes (streaming):", err)
										}
									}
								}
							}

							const updatedAssistant = {
								...assistantPlaceholder,
								content: finalText,
								parts: finalParts,
							}
							const finalMessages = buildFinalMessages(updatedAssistant)
							setMessages(finalMessages)
							pushConversationId(record.conversationId)

							// Capture SDK session ID and update timestamp
							if (
								typeof record.sdkSessionId === "string" &&
								record.sdkSessionId.length > 0
							) {
								sdkSessionIdRef.current = record.sdkSessionId
								lastMessageTimeRef.current = Date.now()
								console.log(
									"[Frontend Session] Captured sdkSessionId:",
									record.sdkSessionId,
								)
								if (onSdkSessionId) {
									onSdkSessionId(record.sdkSessionId)
								}
							}

							if (onComplete) {
								onComplete({ text: finalText, messages: finalMessages })
							}
							setIsThinking(false)
							finished = true
							break
						} else if (type === "error") {
							const message =
								typeof record.message === "string"
									? record.message
									: "Unable to process your request"
							const errorAssistant = {
								...assistantPlaceholder,
								content: message,
								parts: [{ type: "text", text: message }],
							}
							const finalMessages = buildFinalMessages(errorAssistant)
							setMessages(finalMessages)
							toast.error(message)
							finished = true
							break
						}
					}

					if (controller.signal.aborted) {
						aborted = true
						await cancelReader()
						break
					}
					if (finished) {
						await cancelReader()
						break
					}
				}

				if (!finished && !aborted) {
					// Stream ended unexpectedly – treat as error
					throw new Error("Chat response terminated unexpectedly")
				}
			} catch (error) {
				setIsThinking(false)
				if (controller.signal.aborted) {
					setStatus("ready")
					return
				}
				const message =
					error instanceof Error
						? error.message
						: "Unable to process your request"
				const errorAssistant = {
					...assistantPlaceholder,
					content: message,
					parts: [{ type: "text", text: message }],
				}
				const finalMessages = [...history, userMessage, errorAssistant]
				setMessages(finalMessages)
				toast.error(message)
			} finally {
				clearTimeout(timeoutId)
				abortRef.current = null
				setIsThinking(false)
				setStatus("ready")
			}
		},
		[buildRequestBody, endpoint, onConversationId, setMessages, status],
	)

	const regenerate = useCallback(
		({ messageId }: RegeneratePayload = {}) => {
			const current = messagesRef.current
			if (current.length === 0) return
			let targetIndex =
				typeof messageId === "string"
					? current.findIndex((item) => item.id === messageId)
					: current.length - 1
			if (targetIndex < 0) targetIndex = current.length - 1
			let userIndex = -1
			for (let i = targetIndex; i >= 0; i -= 1) {
				if (current[i]?.role === "user") {
					userIndex = i
					break
				}
			}
			if (userIndex < 0) return
			const userMessage = current[userIndex]
			if (!userMessage) return
			const textPart = Array.isArray(userMessage.parts)
				? userMessage.parts.find((part): part is TextPart =>
						Boolean(part && (part as any).type === "text"),
					)
				: undefined
			const text = textPart?.text ?? userMessage.content
			if (!text) return
			const truncatedHistory = current.slice(0, userIndex)
			setMessages(truncatedHistory)
			messagesRef.current = truncatedHistory
			void sendMessage({ text })
		},
		[sendMessage, setMessages],
	)

	return {
		messages: messagesState,
		setMessages,
		sendMessage,
		status,
		stop,
		id: conversationRef.current,
		regenerate,
		isThinking,
	} as const
}

export function ChatMessages() {
	const { selectedProject } = useProject()
	const {
		currentChatId,
		setCurrentChatId,
		setConversation,
		getCurrentConversation,
		setConversationTitle,
		setSdkSessionId,
		getSdkSessionId,
		getCurrentChat,
	} = usePersistentChat()

	const activeChatIdRef = useRef<string | null>(null)
	const shouldGenerateTitleRef = useRef<boolean>(false)
	const skipHydrationRef = useRef(false)

	const { setDocumentIds, clear } = useGraphHighlights()
	const { scopedDocumentIds, placedDocumentIds } = useCanvasSelection()
	const { hasScopedDocuments, scopedCount } = useCanvasState()
	const { viewMode } = useViewMode()

	// Canvas agent integration for context
	const canvasAgent = useCanvasAgentOptional()

	// Mode and Model now handled by Claude Agent SDK backend
	// Project scoping for chat (defaults to global selection or All Projects)
	const [project, setProject] = useState<string>(
		selectedProject && selectedProject !== "sm_project_default"
			? selectedProject
			: "__ALL__",
	)
	// Expanded context toggle (increases search result limits)
	const [expandContext, setExpandContext] = useState<boolean>(false)
	const [projects, setProjects] = useState<
		Array<{ id: string; name: string; containerTag: string }>
	>([])
	const [loadingProjects, setLoadingProjects] = useState(false)

	useEffect(() => {
		let ignore = false
		async function load() {
			try {
				setLoadingProjects(true)
				const res = await fetch(`${BACKEND_URL}/v3/projects`, {
					credentials: "include",
					headers: { "Content-Type": "application/json" },
				})
				if (!res.ok) return
				const data = await res.json()
				if (ignore) return
				const list = Array.isArray(data?.projects) ? data.projects : []
				setProjects(
					list.map((p: any) => ({
						id: String(p.id),
						name: String(p.name ?? "Untitled Project"),
						containerTag: String(p.containerTag),
					})),
				)
			} catch {
				// noop
			} finally {
				if (!ignore) setLoadingProjects(false)
			}
		}
		load()
		return () => {
			ignore = true
		}
	}, [])

	// Keep chat project in sync with global project selection in real-time
	useEffect(() => {
		if (selectedProject && selectedProject !== "sm_project_default") {
			// Always sync with selected project
			setProject(selectedProject)
		} else if (!selectedProject || selectedProject === "sm_project_default") {
			// Reset to all projects if no specific project selected
			setProject("__ALL__")
		}
	}, [selectedProject])

	// Inline mentions: pick canvas docs per message (@)
	const [mentionedDocIds, setMentionedDocIdsState] = useState<string[]>([])
	const mentionedDocIdsRef = useRef<string[]>([])
	const addMentionedDocId = useCallback(
		(id: string) => {
			setMentionedDocIdsState((prev) => {
				const next = [...new Set([...prev, id])]
				mentionedDocIdsRef.current = next
				return next
			})
		},
		[setMentionedDocIdsState],
	)
	const removeMentionedDocId = useCallback(
		(id: string) => {
			setMentionedDocIdsState((prev) => {
				const next = prev.filter((x) => x !== id)
				mentionedDocIdsRef.current = next
				return next
			})
		},
		[setMentionedDocIdsState],
	)
	const clearMentionedDocIds = useCallback(() => {
		mentionedDocIdsRef.current = []
		setMentionedDocIdsState([])
	}, [setMentionedDocIdsState])
	const pendingMentionedDocIdsRef = useRef<string[]>([])
	const pendingMentionDocIds = useChatMentionQueue(
		(state) => state.pendingDocIds,
	)
	const consumePendingMentionDocIds = useChatMentionQueue(
		(state) => state.consume,
	)
	useEffect(() => {
		if (
			!Array.isArray(pendingMentionDocIds) ||
			pendingMentionDocIds.length === 0
		) {
			return
		}
		const nextIds = consumePendingMentionDocIds()
		if (!Array.isArray(nextIds) || nextIds.length === 0) {
			return
		}
		let added = false
		nextIds.forEach((id) => {
			if (typeof id === "string" && id.length > 0) {
				addMentionedDocId(id)
				added = true
			}
		})
		if (added) {
			setMentionOpen(false)
		}
	}, [addMentionedDocId, consumePendingMentionDocIds, pendingMentionDocIds])

	// Provider selection
	const { provider, setProvider } = useProviderSelection()

	const composeRequestBody = useCallback(
		(
			userMessage: string,
			sdkSessionId: string | null,
			continueSession: boolean,
		) => {
			// Use pending ref if available, otherwise use current state
			const currentMentionedIds =
				pendingMentionedDocIdsRef.current.length > 0
					? pendingMentionedDocIdsRef.current
					: mentionedDocIdsRef.current

			const scopedIds =
				currentMentionedIds.length > 0
					? currentMentionedIds
					: hasScopedDocuments
						? scopedDocumentIds
						: undefined

			const metadata: Record<string, unknown> = {}
			if (project && project !== "__ALL__") {
				metadata.projectId = project
			}
			if (expandContext) {
				metadata.expandContext = true
			}
			if (currentMentionedIds.length > 0) {
				metadata.forceRawDocs = true
				metadata.mentionedDocIds = currentMentionedIds
			}

			// Add canvas context when user is viewing the canvas
			if (viewMode === "infinity" && canvasAgent) {
				const canvasContext = canvasAgent.buildContextForAgent()
				if (canvasContext) {
					metadata.canvasContext = canvasContext
					console.log("[ChatMessages] Including canvas context in request:", canvasContext)
				}
			}

			// Clear the pending ref after using it
			pendingMentionedDocIdsRef.current = []

			return {
				message: userMessage,
				...(sdkSessionId ? { sdkSessionId, resume: true } : {}),
				...(continueSession ? { continueSession: true } : {}),
				...(scopedIds && scopedIds.length > 0
					? { scopedDocumentIds: scopedIds }
					: {}),
				...(Object.keys(metadata).length > 0 ? { metadata } : {}),
				provider, // Include provider selection
			}
		},
		[
			hasScopedDocuments,
			scopedDocumentIds,
			project,
			expandContext,
			provider, // Add provider to dependencies
			viewMode,
			canvasAgent,
		],
	)

	const handleAssistantComplete = useCallback(
		async ({ text }: { text: string; messages?: ClaudeChatMessage[] }) => {
			const activeId = activeChatIdRef.current
			if (!activeId) return
			if (!shouldGenerateTitleRef.current) return
			const trimmed = text.trim()
			if (!trimmed) return
			shouldGenerateTitleRef.current = false
			try {
				const response = await fetch(`${BACKEND_URL}/chat/title`, {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ prompt: trimmed }),
				})
				if (!response.ok) return
				const completion = (await response.text()).trim()
				if (!completion) return
				setConversationTitle(activeId, completion)
			} catch (error) {
				console.error("Failed to generate chat title", error)
			}
		},
		[setConversationTitle],
	)

	const {
		messages,
		sendMessage,
		status,
		stop,
		setMessages,
		id,
		regenerate,
		isThinking,
	} = useClaudeChat({
		conversationId: currentChatId || undefined,
		endpoint: `${BACKEND_URL}/chat/v2`,
		buildRequestBody: composeRequestBody,
		getSdkSessionId, // Passar função para carregar sdkSessionId salvo
		onComplete: handleAssistantComplete,
		onConversationId: (nextId) => {
			activeChatIdRef.current = nextId
			shouldGenerateTitleRef.current = true
			skipHydrationRef.current = true
			setCurrentChatId(nextId)
		},
		onSdkSessionId: (sdkId) => {
			// Salvar sdkSessionId na conversa atual
			console.log("========================================")
			console.log("📥 [Callback] Received SDK session ID from backend:", sdkId)
			const activeId = activeChatIdRef.current || currentChatId
			console.log("[Callback] Active chat ID:", activeId)
			if (activeId && sdkId) {
				console.log("💾 [Callback] Calling setSdkSessionId to save...")
				setSdkSessionId(activeId, sdkId)
				console.log("✅ [Callback] SDK session ID saved successfully")
			} else {
				console.log("⚠️ [Callback] Cannot save - missing activeId or sdkId")
			}
			console.log("========================================")
		},
	})

	const [input, setInput] = useState("")
	const [mentionOpen, setMentionOpen] = useState(false)
	const [mentionQuery, setMentionQuery] = useState("")
	const mentionInputRef = useRef<HTMLInputElement | null>(null)
	useEffect(() => {
		if (!mentionOpen) return
		const frame = requestAnimationFrame(() => {
			const node = mentionInputRef.current
			if (node) {
				node.focus()
				node.select()
			}
		})
		return () => cancelAnimationFrame(frame)
	}, [mentionOpen])

	type CanvasDoc = {
		id: string
		title: string | null
		type?: string | null
		url?: string | null
		preview?: string | null
	}
	const [canvasDocs, setCanvasDocs] = useState<CanvasDoc[]>([])
	const canvasDocMap = useMemo(() => {
		const map = new Map<string, CanvasDoc>()
		for (const doc of canvasDocs) {
			map.set(doc.id, doc)
		}
		return map
	}, [canvasDocs])
	useEffect(() => {
		let ignore = false
		async function load() {
			try {
				// If there are canvas docs, use those. Otherwise fetch all project docs
				if (placedDocumentIds && placedDocumentIds.length > 0) {
					const res = await fetch(
						`${BACKEND_URL}/v3/documents/documents/by-ids`,
						{
							method: "POST",
							credentials: "include",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ ids: placedDocumentIds, by: "id" }),
						},
					)
					if (!res.ok) return
					const data = await res.json()
					if (ignore) return
					const docs = Array.isArray(data?.documents) ? data.documents : []
					setCanvasDocs(
						docs.map((d: any) => ({
							id: d.id,
							title: d.title ?? null,
							type: d.type ?? null,
							url: d.url ?? null,
							preview:
								(d.metadata &&
									(d.metadata.ogImage ||
										d.metadata.twitterImage ||
										d.metadata.previewImage)) ||
								d.ogImage ||
								null,
						})),
					)
				} else {
					// Fetch all documents from current project
					const containerTags =
						selectedProject && selectedProject !== DEFAULT_PROJECT_ID
							? [selectedProject]
							: undefined
					const res = await fetch(`${BACKEND_URL}/v3/documents/documents`, {
						method: "POST",
						credentials: "include",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							containerTags,
							limit: 50,
							page: 1,
							sort: "updatedAt",
							order: "desc",
						}),
					})
					if (!res.ok) return
					const data = await res.json()
					if (ignore) return
					const docs = Array.isArray(data?.documents) ? data.documents : []
					setCanvasDocs(
						docs.map((d: any) => ({
							id: d.id,
							title: d.title ?? null,
							type: d.type ?? null,
							url: d.url ?? null,
							preview:
								(d.metadata &&
									(d.metadata.ogImage ||
										d.metadata.twitterImage ||
										d.metadata.previewImage)) ||
								d.ogImage ||
								null,
						})),
					)
				}
			} catch {}
		}
		load()
		return () => {
			ignore = true
		}
	}, [placedDocumentIds, selectedProject])

	const filteredMention = useMemo(() => {
		const q = mentionQuery.trim().toLowerCase()
		const base = canvasDocs.filter((d) => !mentionedDocIds.includes(d.id))
		if (!q) return base
		return base.filter((d) => (d.title || d.id).toLowerCase().includes(q))
	}, [canvasDocs, mentionQuery, mentionedDocIds])

	const sendUserMessage = (text: string) => {
		const ids = [...mentionedDocIdsRef.current]
		// Store in ref so composeRequestBody can access it synchronously
		pendingMentionedDocIdsRef.current = ids
		sendMessage({ text, mentionedDocIds: ids })
		// Clear mentioned docs after capturing them
		if (ids.length > 0) clearMentionedDocIds()
	}

	const getPreviewUrl = (doc: CanvasDoc): string | null => {
		if (doc.preview && typeof doc.preview === "string") return doc.preview
		const url = doc.url || ""
		try {
			const u = new URL(url)
			const host = u.hostname
			if (host.includes("youtube.com") || host.includes("youtu.be")) {
				let vid = ""
				if (host.includes("youtu.be")) {
					vid = u.pathname.replace(/\//g, "")
				} else {
					vid = u.searchParams.get("v") || ""
				}
				if (vid) return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
			}
		} catch {}
		return null
	}
	const [savingInput, setSavingInput] = useState(false)
	const [savingMessageIds, setSavingMessageIds] = useState<Set<string>>(
		new Set(),
	)

	// Reset conversation when project changes to avoid cross-project context bleed
	useEffect(() => {
		setMessages([])
		shouldGenerateTitleRef.current = false
	}, [project, setMessages])

	// Create new chat when chat is opened (to avoid showing old messages)
	const { isOpen } = useChatOpen()
	const prevIsOpenRef = useRef(false)
	const lastClosedTimeRef = useRef<number>(0)

	useEffect(() => {
		// Detect when chat is opened (transitions from closed to open)
		if (isOpen && !prevIsOpenRef.current) {
			const now = Date.now()
			const timeSinceClosed = now - lastClosedTimeRef.current
			const QUICK_REOPEN_THRESHOLD = 60 * 1000 // 1 minute

			// Always create a new chat when opening, unless:
			// - Chat was closed and reopened within 1 minute (quick toggle)
			// - AND there are already messages in the current chat
			const isQuickReopen = timeSinceClosed < QUICK_REOPEN_THRESHOLD && messages.length > 0

			if (!isQuickReopen) {
				const newChatId = crypto.randomUUID()
				setCurrentChatId(newChatId)
				setMessages([])
				shouldGenerateTitleRef.current = false
			}
		}

		// Track when chat is closed
		if (!isOpen && prevIsOpenRef.current) {
			lastClosedTimeRef.current = Date.now()
		}

		prevIsOpenRef.current = isOpen
	}, [isOpen, messages.length, setCurrentChatId, setMessages])

	async function saveMemory(content: string) {
		const trimmed = content.trim()
		if (!trimmed) {
			toast.error("Nothing to save")
			return
		}
		if (selectedProject === DEFAULT_PROJECT_ID) {
			toast.error("Select a project to save")
			return
		}
		try {
			const res = await fetch(`${BACKEND_URL}/v3/documents`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: trimmed,
					containerTags:
						selectedProject && selectedProject !== DEFAULT_PROJECT_ID
							? [selectedProject]
							: undefined,
					metadata: {
						source: "chat",
						type: "text",
						from_chat: true,
						projectId: selectedProject,
					},
				}),
			})
			if (!res.ok) {
				let msg = "Failed to save memory"
				try {
					const data = await res.json()
					msg = data?.error?.message || msg
				} catch {}
				throw new Error(msg)
			}
			toast.success("Memory added")
		} catch (err) {
			console.error(err)
			toast.error(err instanceof Error ? err.message : "Failed to save memory")
		}
	}

	useEffect(() => {
		activeChatIdRef.current = currentChatId ?? id ?? null
	}, [currentChatId, id])

	// Removed: No longer need to split :: since mode/model were removed
	// useEffect that was causing infinite loop

	useEffect(() => {
		if (skipHydrationRef.current) {
			skipHydrationRef.current = false
			return
		}
		const rawActiveId = currentChatId ?? id
		const msgs = getCurrentConversation()
		if (Array.isArray(msgs) && msgs.length > 0) {
			const normalized = msgs.map((message) => {
				const record = message as Record<string, unknown>
				const content =
					typeof record.content === "string" ? (record.content as string) : ""
				const parts = Array.isArray(record.parts)
					? (record.parts as ClaudeChatMessage["parts"])
					: ([
							{ type: "text", text: content } as TextPart,
						] as ClaudeChatMessage["parts"])
				return {
					id:
						typeof record.id === "string"
							? (record.id as string)
							: generateMessageId(),
					role: record.role === "assistant" ? "assistant" : "user",
					content,
					parts,
				} satisfies ClaudeChatMessage
			})
			setMessages(normalized)
		} else {
			setMessages([])
		}
		setInput("")
		if (!rawActiveId) {
			shouldGenerateTitleRef.current = false
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentChatId])

	useEffect(() => {
		const rawActiveId = currentChatId ?? id
		if (rawActiveId && messages.length > 0) {
			setConversation(rawActiveId, messages)
		}
	}, [messages, currentChatId, id, setConversation])

	// Update graph highlights from the most recent tool-searchMemories output
	useEffect(() => {
		try {
			const lastAssistant = [...messages]
				.reverse()
				.find((m) => m.role === "assistant")
			if (!lastAssistant) {
				clear()
				return
			}
			const lastSearchPart = [...lastAssistant.parts]
				.reverse()
				.find((part) => isSearchMemoriesOutputPart(part))
			if (!lastSearchPart) {
				clear()
				return
			}
			const ids = toMemoryResults(lastSearchPart.output?.results)
				.map((result) => result.documentId)
				.filter((id): id is string => typeof id === "string")
			if (ids.length > 0) {
				setDocumentIds(ids)
				return
			}
		} catch {}
		clear()
	}, [messages, setDocumentIds, clear])

	useEffect(() => {
		const currentSummary = getCurrentChat()
		const hasTitle = Boolean(
			currentSummary?.title && currentSummary.title.trim().length > 0,
		)
		shouldGenerateTitleRef.current = !hasTitle
	}, [getCurrentChat])
	const {
		scrollContainerRef,
		bottomRef,
		isFarFromBottom,
		onScroll,
		enableAutoScroll,
		scrollToBottom,
	} = useStickyAutoScroll([messages, status])

	const hasActiveTools = useMemo(() => {
		for (const message of messages) {
			if (message.role !== "assistant") continue
			const parts = Array.isArray(message.parts) ? message.parts : []
			for (const part of parts) {
				if (
					(isGenericToolPart(part) || isSearchMemoriesPart(part)) &&
					(part.state === "input-streaming" || part.state === "input-available")
				) {
					return true
				}
			}
		}
		return false
	}, [messages])

	return (
		<div className="flex flex-col h-full">
			<div className="relative flex-1 bg-chat-surface overflow-hidden">
				<div
					className="flex flex-col gap-3 absolute inset-0 overflow-y-auto px-4 pt-4 pb-6"
					onScroll={onScroll}
					ref={scrollContainerRef}
				>
					{messages.map((message) => (
						<div
							className={cn(
								"flex flex-col gap-1",
								message.role === "user" ? "items-end" : "items-start",
							)}
							key={message.id}
						>
							<div
								className={cn(
									"flex flex-col gap-2 w-full",
									message.role === "user"
										? "border border-border/30 py-3 px-4 rounded-lg bg-muted/20 backdrop-blur-xl text-foreground"
										: "py-1 px-0 text-foreground",
								)}
							>
								{(() => {
									// Coletar todos os tool parts
									const toolParts: Array<{ part: any; index: number }> = []
									const textParts: Array<{ part: any; index: number }> = []
									const otherParts: Array<{ part: any; index: number }> = []

									message.parts.forEach((part: any, index) => {
										if (
											isSearchMemoriesPart(part) ||
											isAddMemoryPart(part) ||
											isGenericToolPart(part)
										) {
											toolParts.push({ part, index })
										} else if (isTextPart(part)) {
											textParts.push({ part, index })
										} else {
											otherParts.push({ part, index })
										}
									})

									// Encontrar o último tool ativo (priorizando os que estão rodando)
									const getToolPriority = (part: any) => {
										if (
											isSearchMemoriesPart(part) ||
											isAddMemoryPart(part) ||
											isGenericToolPart(part)
										) {
											const state = part.state
											// Prioridade: rodando > erro > completo
											if (
												state === "input-streaming" ||
												state === "input-available"
											)
												return 3
											if (state === "output-error") return 2
											if (state === "output-available") return 1
										}
										return 0
									}

									const activeTool =
										toolParts.length > 0
											? toolParts.reduce((latest, current) => {
													const currentPriority = getToolPriority(current.part)
													const latestPriority = getToolPriority(latest.part)
													if (currentPriority > latestPriority) return current
													if (
														currentPriority === latestPriority &&
														current.index > latest.index
													)
														return current
													return latest
												})
											: null

									// Renderizar texto primeiro
									const textElements = textParts.flatMap(({ part, index }) => {
										const partKey = `${message.id}-${index}`
										const segments = splitTextIntoSegments(part.text ?? "")
										return segments.map((segment, segmentIndex) => {
											const segmentKey = `${partKey}-text-${segmentIndex}`
											if (segment.type === "code") {
												return (
													<CodeBlock
														className="mt-2"
														code={segment.content.trimEnd()}
														key={segmentKey}
														language={segment.language ?? undefined}
													>
														<CodeBlockCopyButton className="h-7 px-2 text-[11px]" />
													</CodeBlock>
												)
											}
											if (segment.content.trim().length === 0) {
												return <div className="h-2" key={segmentKey} />
											}
											return (
												<Response key={segmentKey}>
													<Streamdown>{segment.content}</Streamdown>
												</Response>
											)
										})
									})

									// Renderizar apenas o tool ativo
									const toolElement = activeTool
										? (() => {
												const { part, index } = activeTool
												const partKey = `${message.id}-${index}`

												if (isSearchMemoriesPart(part)) {
													const isSuccess = part.state === "output-available"
													const countValue = isSuccess
														? part.output?.count
														: undefined
													const foundCount =
														typeof countValue === "number"
															? countValue
															: typeof countValue === "string"
																? Number(countValue)
																: undefined
													const results = isSuccess
														? toMemoryResults(part.output?.results)
														: []

													return (
														<ToolCard
															durationMs={part.durationMs}
															errorMessage={
																part.error ?? "Erro ao buscar memórias"
															}
															key={`${partKey}-search`}
															loadingMessage="Procurando memórias relevantes..."
															state={part.state}
															type="tool-search_memories"
														>
															{isSuccess ? (
																<ExpandableMemories
																	foundCount={foundCount ?? results.length}
																	results={results}
																/>
															) : null}
														</ToolCard>
													)
												}

												if (isAddMemoryPart(part)) {
													const isSuccess = part.state === "output-available"
													return (
														<ToolCard
															durationMs={part.durationMs}
															errorMessage={
																part.error ??
																"Não foi possível salvar a memória"
															}
															key={`${partKey}-add`}
															loadingMessage="Salvando memória..."
															state={part.state}
															successMessage={
																<span className="text-xs text-muted-foreground">
																	Memória adicionada com sucesso
																</span>
															}
															type="tool-add_memory"
														/>
													)
												}

												if (isGenericToolPart(part)) {
													const outputSegments = part.outputText
														? splitTextIntoSegments(part.outputText)
														: []
													const isSuccess = part.state === "output-available"

													return (
														<ToolCard
															durationMs={part.durationMs}
															errorMessage={
																part.error ??
																(typeof part.outputText === "string" &&
																part.outputText.trim().length > 0
																	? part.outputText
																	: undefined)
															}
															key={`${partKey}-tool`}
															loadingMessage="Executando..."
															state={part.state}
															successMessage={
																isSuccess && outputSegments.length === 0 ? (
																	<span className="text-xs text-muted-foreground">
																		Ferramenta executada com sucesso
																	</span>
																) : null
															}
															type={buildToolType(
																part.toolName,
																part.toolUseId,
															)}
														>
															{isSuccess && outputSegments.length > 0
																? outputSegments.map((segment, outputIndex) => {
																		const segmentKey = `${partKey}-tool-output-${outputIndex}`
																		if (segment.type === "code") {
																			return (
																				<CodeBlock
																					className="mt-2"
																					code={segment.content.trimEnd()}
																					key={segmentKey}
																					language={
																						segment.language ?? undefined
																					}
																				>
																					<CodeBlockCopyButton className="h-7 px-2 text-[11px]" />
																				</CodeBlock>
																			)
																		}
																		if (segment.content.trim().length === 0) {
																			return (
																				<div className="h-2" key={segmentKey} />
																			)
																		}
																		return (
																			<Response key={segmentKey}>
																				<Streamdown>
																					{segment.content}
																				</Streamdown>
																			</Response>
																		)
																	})
																: null}
														</ToolCard>
													)
												}

												return null
											})()
										: null

									// Renderizar outros parts
									const otherElements = otherParts.flatMap(
										({ part, index }) => {
											const partKey = `${message.id}-${index}`

											if (isMentionedDocsPart(part)) {
												if (
													!Array.isArray(part.docIds) ||
													part.docIds.length === 0
												) {
													return []
												}
												const mentionIds = Array.from(new Set(part.docIds))
												return [
													<div
														className="flex flex-col gap-1 text-xs text-muted-foreground"
														key={`${partKey}-mentions`}
													>
														<span className="uppercase tracking-wide text-[10px] text-muted-foreground/60">
															Documentos mencionados
														</span>
														<div className="flex flex-wrap gap-1.5">
															{mentionIds.map((id) => {
																const doc = canvasDocMap.get(id)
																const label = doc?.title || id
																const preview = doc ? getPreviewUrl(doc) : null
																const href =
																	doc &&
																	typeof doc.url === "string" &&
																	doc.url.length > 0
																		? doc.url
																		: undefined
																const content = (
																	<>
																		{preview ? (
																			<img
																				alt=""
																				className="w-5 h-5 rounded-sm object-cover"
																				src={preview}
																			/>
																		) : (
																			<span className="w-5 h-5 rounded-sm bg-muted inline-block" />
																		)}
																		<span className="truncate max-w-[160px]">
																			@{label}
																		</span>
																	</>
																)
																return href ? (
																	<a
																		className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-muted/50 text-foreground hover:bg-muted transition"
																		href={href}
																		key={id}
																		rel="noreferrer"
																		target="_blank"
																	>
																		{content}
																	</a>
																) : (
																	<div
																		className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-muted/50 text-foreground"
																		key={id}
																	>
																		{content}
																	</div>
																)
															})}
														</div>
													</div>,
												]
											}

											return []
										},
									)

									// Retornar todos os elementos: texto, tool ativo, e outros
									return [
										...textElements,
										...(toolElement ? [toolElement] : []),
										...otherElements,
									]
								})()}
							</div>
							{message.role === "assistant" && (
								<div className="flex items-center gap-1 mt-1">
									<Button
										className="size-7 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted border border-border"
										onClick={() => {
											const combinedText = message.parts
												.filter((part) => isTextPart(part))
												.map((part) => part.text)
												.join("\n")
											navigator.clipboard.writeText(combinedText)
											toast.success("Copied to clipboard")
										}}
										size="icon"
										variant="ghost"
									>
										<Copy className="size-3.5" />
									</Button>
									<Button
										className="size-7 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted border border-border"
										disabled={
											message.id ? savingMessageIds.has(message.id) : false
										}
										onClick={async () => {
											const id = message.id
											if (!id) return
											if (savingMessageIds.has(id)) return
											const combinedText = message.parts
												.filter((part) => isTextPart(part))
												.map((part) => part.text)
												.join("\n")
											setSavingMessageIds((prev) => new Set(prev).add(id))
											try {
												await saveMemory(combinedText)
											} finally {
												setSavingMessageIds((prev) => {
													const next = new Set(prev)
													next.delete(id)
													return next
												})
											}
										}}
										size="icon"
										title="Add this reply to memory"
										variant="ghost"
									>
										{message.id && savingMessageIds.has(message.id) ? (
											<Spinner className="size-3.5" />
										) : (
											<Plus className="size-3.5" />
										)}
									</Button>
									<Button
										className="size-7 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted border border-border"
										onClick={() => regenerate({ messageId: message.id })}
										size="icon"
										variant="ghost"
									>
										<RotateCcw className="size-3.5" />
									</Button>
								</div>
							)}
						</div>
					))}
					{isThinking && !hasActiveTools && (
						<div className="flex text-muted-foreground justify-start gap-1.5 px-4 py-3 items-center w-full">
							<Spinner className="size-3" /> Pensando...
						</div>
					)}
					<div ref={bottomRef} />
				</div>

				<Button
					className={cn(
						"rounded-full w-fit mx-auto shadow-md z-10 absolute inset-x-0 bottom-4 flex justify-center",
						"transition-all duration-200 ease-out",
						"!text-black h-7 px-3 text-xs",
						isFarFromBottom
							? "opacity-100 scale-100 pointer-events-auto"
							: "opacity-0 scale-95 pointer-events-none",
					)}
					onClick={() => {
						enableAutoScroll()
						scrollToBottom("smooth")
					}}
					type="button"
					variant="default"
				>
					Scroll to bottom
				</Button>
			</div>
			<form
				className="px-3 pb-3 pt-1 relative bg-chat-surface"
				onSubmit={(e) => {
					e.preventDefault()
					if (status === "submitted") return
					if (status === "streaming") {
						stop()
						return
					}
					if (input.trim()) {
						enableAutoScroll()
						scrollToBottom("auto")
						sendUserMessage(input)
						setInput("")
					}
				}}
			>
				{/* Mentioned docs chips */}
				{mentionedDocIds.length > 0 && (
					<div className="px-1 pb-1.5 flex flex-wrap gap-1">
						{mentionedDocIds.map((id) => {
							const doc = canvasDocs.find((d) => d.id === id)
							const preview = doc ? getPreviewUrl(doc) : null
							return (
								<button
									className="text-[10px] pl-1 pr-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex items-center gap-1 transition-colors"
									key={id}
									onClick={() => removeMentionedDocId(id)}
									title={doc?.title || id}
									type="button"
								>
									{preview ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img
											alt=""
											className="w-3 h-3 object-cover rounded-sm"
											src={preview}
										/>
									) : (
										<span className="w-3 h-3 rounded-sm bg-muted/50 inline-block" />
									)}
									<span className="truncate max-w-[100px]">@{doc?.title || id}</span>
									<X className="size-2.5 opacity-60" />
								</button>
							)
						})}
					</div>
				)}
				{/* Provider selector */}
				<div className="flex items-center px-1 pb-1.5">
					<ProviderSelector
						disabled={status === "submitted"}
						onChange={setProvider}
						value={provider}
					/>
				</div>
				<InputGroup className="rounded-lg border border-border/20 bg-muted/20 focus-within:border-border/40 focus-within:ring-0 focus-within:ring-offset-0 transition-colors">
					<InputGroupTextarea
						className="text-foreground placeholder-muted-foreground/50 text-sm"
						disabled={status === "submitted"}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							// Open mentions on '@'
							if (e.key === "@") {
								const target = e.currentTarget
								const caret = target.selectionStart ?? target.value.length
								e.preventDefault()
								setMentionOpen(true)
								setMentionQuery("")
								requestAnimationFrame(() => {
									target.selectionStart = caret
									target.selectionEnd = caret
								})
								return
							}
							// Close mentions with Escape
							if (e.key === "Escape" && mentionOpen) {
								setMentionOpen(false)
								return
							}
							if (mentionOpen && e.key === "Enter") {
								e.preventDefault()
								const nextDoc = filteredMention[0]
								if (nextDoc) {
									addMentionedDocId(nextDoc.id)
									setMentionOpen(false)
									setMentionQuery("")
								}
								return
							}
							// Submit on Enter
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								if (input.trim() && status !== "submitted") {
									enableAutoScroll()
									scrollToBottom("auto")
									sendUserMessage(input)
									setMentionOpen(false)
									setInput("")
								}
							}
						}}
						placeholder="Ask, Search or Chat..."
						value={input}
					/>
					{/* Left bottom corner: quick-save button */}
					<InputGroupAddon align="inline-start" className="gap-1 bottom-0">
						<InputGroupButton
							className="h-7 w-7 p-0 hover:bg-muted/50 text-muted-foreground hover:text-foreground rounded-md transition-colors"
							disabled={savingInput || status === "submitted"}
							onClick={async () => {
								if (!input.trim()) {
									toast.error("Type something to save")
									return
								}
								setSavingInput(true)
								try {
									await saveMemory(input)
								} finally {
									setSavingInput(false)
								}
							}}
							size="sm"
							type="button"
							variant="ghost"
						>
							{savingInput ? (
								<Spinner className="size-3" />
							) : (
								<Plus className="size-3.5" />
							)}
						</InputGroupButton>
					</InputGroupAddon>

					{/* Submit button */}
					<InputGroupAddon align="inline-end" className="gap-1 bottom-0">
						<InputGroupButton
							className="h-7 w-7 p-0 bg-foreground/10 hover:bg-foreground/20 text-foreground rounded-md disabled:opacity-30 transition-colors"
							disabled={status === "submitted" || status === "streaming"}
							size="sm"
							type="submit"
						>
							{status === "ready" ? (
								<ArrowUp className="size-3.5" />
							) : status === "submitted" || status === "streaming" ? (
								<Spinner className="size-3" />
							) : (
								<X className="size-3.5" />
							)}
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
				{mentionOpen && (
					<div className="absolute bottom-16 left-3 right-3 max-h-64 overflow-auto rounded-lg border border-border/30 bg-background/95 backdrop-blur-xl z-10 p-2 shadow-lg">
						<div className="mb-2">
							<input
								className="w-full text-xs bg-muted/30 border-0 rounded-md px-2.5 py-1.5 text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border/50"
								onChange={(e) => setMentionQuery(e.target.value)}
								placeholder="Search documents..."
								ref={mentionInputRef}
								value={mentionQuery}
							/>
						</div>
						{filteredMention.length === 0 ? (
							<div className="text-xs text-muted-foreground/70 px-1 py-2">
								No documents found
							</div>
						) : (
							<div className="space-y-0.5">
								{filteredMention.slice(0, 8).map((d) => {
									const preview = getPreviewUrl(d)
									return (
										<button
											className="w-full text-left text-xs text-foreground/80 hover:text-foreground hover:bg-muted/50 rounded-md px-2 py-1.5 flex items-center gap-2 transition-colors"
											key={d.id}
											onClick={() => {
												addMentionedDocId(d.id)
												setMentionOpen(false)
											}}
											type="button"
										>
											{preview ? (
												// eslint-disable-next-line @next/next/no-img-element
												<img
													alt=""
													className="w-6 h-4 object-cover rounded-sm"
													src={preview}
												/>
											) : (
												<span className="w-6 h-4 rounded-sm bg-muted/50 inline-block" />
											)}
											<span className="truncate">@{d.title || d.id}</span>
										</button>
									)
								})}
							</div>
						)}
					</div>
				)}
			</form>
		</div>
	)
}
