var __createBinding =
	(this && this.__createBinding) ||
	(Object.create
		? (o, m, k, k2) => {
				if (k2 === undefined) k2 = k
				var desc = Object.getOwnPropertyDescriptor(m, k)
				if (
					!desc ||
					("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
				) {
					desc = { enumerable: true, get: () => m[k] }
				}
				Object.defineProperty(o, k2, desc)
			}
		: (o, m, k, k2) => {
				if (k2 === undefined) k2 = k
				o[k2] = m[k]
			})
exports.__esModule = true
exports.usePersistentChatStore =
	exports.usePersistentChat =
	exports.useChatOpen =
	exports.useMemoryGraphPosition =
	exports.useProject =
	exports.useChatStore =
	exports.useMemoryGraphStore =
	exports.useProjectStore =
		void 0
var zustand_1 = require("zustand")
var middleware_1 = require("zustand/middleware")
exports.useProjectStore = (0, zustand_1.create)()(
	(0, middleware_1.persist)(
		(set) => ({
			selectedProject: "sm_project_default",
			setSelectedProject: (projectId) => set({ selectedProject: projectId }),
		}),
		{
			name: "selectedProject",
		},
	),
)
exports.useMemoryGraphStore = (0, zustand_1.create)()((set) => ({
	positionX: 0,
	positionY: 0,
	setPositionX: (x) => set({ positionX: x }),
	setPositionY: (y) => set({ positionY: y }),
	setPosition: (x, y) => set({ positionX: x, positionY: y }),
}))
exports.useChatStore = (0, zustand_1.create)()((set, get) => ({
	isOpen: false,
	setIsOpen: (isOpen) => set({ isOpen: isOpen }),
	toggleChat: () => set({ isOpen: !get().isOpen }),
}))
function useProject() {
	var selectedProject = (0, exports.useProjectStore)(
		(state) => state.selectedProject,
	)
	var setSelectedProject = (0, exports.useProjectStore)(
		(state) => state.setSelectedProject,
	)
	return {
		selectedProject: selectedProject,
		setSelectedProject: setSelectedProject,
	}
}
exports.useProject = useProject
function useMemoryGraphPosition() {
	var positionX = (0, exports.useMemoryGraphStore)((state) => state.positionX)
	var positionY = (0, exports.useMemoryGraphStore)((state) => state.positionY)
	var setPositionX = (0, exports.useMemoryGraphStore)(
		(state) => state.setPositionX,
	)
	var setPositionY = (0, exports.useMemoryGraphStore)(
		(state) => state.setPositionY,
	)
	var setPosition = (0, exports.useMemoryGraphStore)(
		(state) => state.setPosition,
	)
	return {
		x: positionX,
		y: positionY,
		setX: setPositionX,
		setY: setPositionY,
		setPosition: setPosition,
	}
}
exports.useMemoryGraphPosition = useMemoryGraphPosition
function useChatOpen() {
	var isOpen = (0, exports.useChatStore)((state) => state.isOpen)
	var setIsOpen = (0, exports.useChatStore)((state) => state.setIsOpen)
	var toggleChat = (0, exports.useChatStore)((state) => state.toggleChat)
	return { isOpen: isOpen, setIsOpen: setIsOpen, toggleChat: toggleChat }
}
exports.useChatOpen = useChatOpen
var chat_1 = require("./chat")
__createBinding(exports, chat_1, "usePersistentChat")
__createBinding(exports, chat_1, "usePersistentChatStore")
