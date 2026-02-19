import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ProjectState {
	selectedProject: string
	setSelectedProject: (projectId: string) => void
}

export const useProjectStore = create<ProjectState>()(
	persist(
		(set) => ({
			selectedProject: "default",
			setSelectedProject: (projectId) => set({ selectedProject: projectId }),
		}),
		{
			name: "selectedProject",
		},
	),
)

interface ChatState {
	isOpen: boolean
	setIsOpen: (isOpen: boolean) => void
	toggleChat: () => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
	isOpen: false,
	setIsOpen: (isOpen) => set({ isOpen }),
	toggleChat: () => set({ isOpen: !get().isOpen }),
}))

type ChatMode = "default" | "council"

interface ChatPreferencesState {
	mode: ChatMode
	setMode: (mode: ChatMode) => void
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
	persist(
		(set) => ({
			mode: "default",
			setMode: (mode) => set({ mode }),
		}),
		{ name: "chat-preferences" },
	),
)

export function useProject() {
	const selectedProject = useProjectStore((state) => state.selectedProject)
	const setSelectedProject = useProjectStore(
		(state) => state.setSelectedProject,
	)
	return { selectedProject, setSelectedProject }
}

export function useChatOpen() {
	const isOpen = useChatStore((state) => state.isOpen)
	const setIsOpen = useChatStore((state) => state.setIsOpen)
	const toggleChat = useChatStore((state) => state.toggleChat)
	return { isOpen, setIsOpen, toggleChat }
}

export function useChatMode() {
	const mode = useChatPreferencesStore((state) => state.mode)
	const setMode = useChatPreferencesStore((state) => state.setMode)
	return { mode, setMode }
}

export { usePersistentChat, usePersistentChatStore } from "./chat"
export { useChatMentionQueue } from "./chat-mentions"
