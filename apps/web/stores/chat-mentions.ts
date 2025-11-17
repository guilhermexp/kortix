import { create } from "zustand"

interface ChatMentionState {
	pendingDocIds: string[]
	enqueue: (ids: string[]) => void
	consume: () => string[]
	clear: () => void
}

export const useChatMentionQueue = create<ChatMentionState>((set, get) => ({
	pendingDocIds: [],
	enqueue: (ids: string[]) => {
		if (!Array.isArray(ids) || ids.length === 0) return
		const unique = Array.from(
			new Set(ids.filter((id) => typeof id === "string" && id.length > 0)),
		)
		if (unique.length === 0) return
		set((state) => ({
			pendingDocIds: Array.from(new Set([...state.pendingDocIds, ...unique])),
		}))
	},
	consume: () => {
		const current = get().pendingDocIds
		if (current.length === 0) return []
		set({ pendingDocIds: [] })
		return current
	},
	clear: () => set({ pendingDocIds: [] }),
}))
