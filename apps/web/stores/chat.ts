import { useCallback } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

type PersistedMessage = {
	id?: string
	role: string
	content?: string
	parts?: Array<unknown>
	[key: string]: unknown
}

/**
 * Deep equality check for chat message arrays to prevent unnecessary state updates
 */
function areUIMessageArraysEqual(
	a: PersistedMessage[],
	b: PersistedMessage[],
): boolean {
	if (a === b) return true
	if (a.length !== b.length) return false

	for (let i = 0; i < a.length; i++) {
		const msgA = a[i]
		const msgB = b[i]

		// Both messages should exist at this index
		if (!msgA || !msgB) return false

		if (msgA === msgB) continue

		if (msgA.id !== msgB.id || msgA.role !== msgB.role) {
			return false
		}

		// Compare the entire message using JSON serialization as a fallback
		// This handles all properties including parts, toolInvocations, etc.
		if (JSON.stringify(msgA) !== JSON.stringify(msgB)) {
			return false
		}
	}

	return true
}

export interface ConversationSummary {
	id: string
	title?: string
	lastUpdated: string
	sdkSessionId?: string | null
}

interface ConversationRecord {
	messages: PersistedMessage[]
	title?: string
	lastUpdated: string
	sdkSessionId?: string | null
}

interface ProjectConversationsState {
	currentChatId: string | null
	conversations: Record<string, ConversationRecord>
}

interface ConversationsStoreState {
	byProject: Record<string, ProjectConversationsState>
	setCurrentChatId: (projectId: string, chatId: string | null) => void
	setConversation: (
		projectId: string,
		chatId: string,
		messages: PersistedMessage[],
	) => void
	deleteConversation: (projectId: string, chatId: string) => void
	setConversationTitle: (
		projectId: string,
		chatId: string,
		title: string | undefined,
	) => void
	setSdkSessionId: (
		projectId: string,
		chatId: string,
		sdkSessionId: string | null,
	) => void
}

export const usePersistentChatStore = create<ConversationsStoreState>()(
	persist(
		(set, _get) => ({
			byProject: {},

			setCurrentChatId(projectId, chatId) {
				set((state) => {
					const project = state.byProject[projectId] ?? {
						currentChatId: null,
						conversations: {},
					}
					return {
						byProject: {
							...state.byProject,
							[projectId]: { ...project, currentChatId: chatId },
						},
					}
				})
			},

			setConversation(projectId, chatId, messages) {
				const now = new Date().toISOString()
				set((state) => {
					const project = state.byProject[projectId] ?? {
						currentChatId: null,
						conversations: {},
					}
					const existing = project.conversations[chatId]

					// Check if messages are actually different to prevent unnecessary updates
					if (
						existing &&
						areUIMessageArraysEqual(existing.messages, messages)
					) {
						return state // No change needed
					}

					const shouldTouchLastUpdated = (() => {
						if (!existing) return messages.length > 0
						return true
					})()

					const record: ConversationRecord = {
						messages,
						title: existing?.title,
						lastUpdated: shouldTouchLastUpdated
							? now
							: (existing?.lastUpdated ?? now),
					}
					return {
						byProject: {
							...state.byProject,
							[projectId]: {
								currentChatId: project.currentChatId,
								conversations: {
									...project.conversations,
									[chatId]: record,
								},
							},
						},
					}
				})
			},

			deleteConversation(projectId, chatId) {
				set((state) => {
					const project = state.byProject[projectId] ?? {
						currentChatId: null,
						conversations: {},
					}
					const { [chatId]: _, ...rest } = project.conversations
					const nextCurrent =
						project.currentChatId === chatId ? null : project.currentChatId
					return {
						byProject: {
							...state.byProject,
							[projectId]: { currentChatId: nextCurrent, conversations: rest },
						},
					}
				})
			},

			setConversationTitle(projectId, chatId, title) {
				const now = new Date().toISOString()
				set((state) => {
					const project = state.byProject[projectId] ?? {
						currentChatId: null,
						conversations: {},
					}
					const existing = project.conversations[chatId]
					if (!existing) return { byProject: state.byProject }
					return {
						byProject: {
							...state.byProject,
							[projectId]: {
								currentChatId: project.currentChatId,
								conversations: {
									...project.conversations,
									[chatId]: { ...existing, title, lastUpdated: now },
								},
							},
						},
					}
				})
			},

			setSdkSessionId(projectId, chatId, sdkSessionId) {
				console.log("========================================")
				console.log("💾 [Store] Saving SDK session ID to localStorage...")
				console.log("[Store] Project:", projectId)
				console.log("[Store] Chat ID:", chatId)
				console.log("[Store] SDK Session ID:", sdkSessionId)
				set((state) => {
					const project = state.byProject[projectId] ?? {
						currentChatId: null,
						conversations: {},
					}
					const existing = project.conversations[chatId]
					if (!existing) {
						console.log(
							"⚠️ [Store] Conversation not found, cannot save SDK session ID",
						)
						console.log("========================================")
						return { byProject: state.byProject }
					}
					console.log("✅ [Store] SDK session ID saved successfully")
					console.log("========================================")
					return {
						byProject: {
							...state.byProject,
							[projectId]: {
								currentChatId: project.currentChatId,
								conversations: {
									...project.conversations,
									[chatId]: { ...existing, sdkSessionId },
								},
							},
						},
					}
				})
			},
		}),
		{
			name: "kortix-chats",
		},
	),
)

// Always scoped to the current project via useProject
import { useProject } from "."

export function usePersistentChat() {
	const { selectedProject } = useProject()
	const projectId = selectedProject

	const projectState = usePersistentChatStore((s) => s.byProject[projectId])
	const setCurrentChatIdRaw = usePersistentChatStore((s) => s.setCurrentChatId)
	const setConversationRaw = usePersistentChatStore((s) => s.setConversation)
	const deleteConversationRaw = usePersistentChatStore(
		(s) => s.deleteConversation,
	)
	const setConversationTitleRaw = usePersistentChatStore(
		(s) => s.setConversationTitle,
	)
	const setSdkSessionIdRaw = usePersistentChatStore((s) => s.setSdkSessionId)

	const conversations: ConversationSummary[] = (() => {
		const convs = projectState?.conversations ?? {}
		return Object.entries(convs).map(([id, rec]) => ({
			id,
			title: rec.title,
			lastUpdated: rec.lastUpdated,
			sdkSessionId: rec.sdkSessionId,
		}))
	})()

	const currentChatId = projectState?.currentChatId ?? null

	function setCurrentChatId(chatId: string | null): void {
		setCurrentChatIdRaw(projectId, chatId)
	}

	function setConversation(chatId: string, messages: PersistedMessage[]): void {
		setConversationRaw(projectId, chatId, messages)
	}

	function deleteConversation(chatId: string): void {
		deleteConversationRaw(projectId, chatId)
	}

	function setConversationTitle(
		chatId: string,
		title: string | undefined,
	): void {
		setConversationTitleRaw(projectId, chatId, title)
	}

	const getCurrentConversation = useCallback((): PersistedMessage[] | undefined => {
		const convs = projectState?.conversations ?? {}
		const id = currentChatId
		if (!id) return undefined
		return convs[id]?.messages
	}, [currentChatId, projectState])

	function getCurrentChat(): ConversationSummary | undefined {
		const id = currentChatId
		if (!id) return undefined
		const rec = projectState?.conversations?.[id]
		if (!rec) return undefined
		return {
			id,
			title: rec.title,
			lastUpdated: rec.lastUpdated,
			sdkSessionId: rec.sdkSessionId,
		}
	}

	function setSdkSessionId(chatId: string, sdkSessionId: string | null): void {
		setSdkSessionIdRaw(projectId, chatId, sdkSessionId)
	}

	const getSdkSessionId = useCallback(
		(chatId?: string): string | null | undefined => {
			const id = chatId ?? currentChatId
			if (!id) return undefined
			const rec = projectState?.conversations?.[id]
			return rec?.sdkSessionId
		},
		[currentChatId, projectState],
	)

	return {
		conversations,
		currentChatId,
		setCurrentChatId,
		setConversation,
		deleteConversation,
		setConversationTitle,
		setSdkSessionId,
		getSdkSessionId,
		getCurrentConversation,
		getCurrentChat,
	}
}
