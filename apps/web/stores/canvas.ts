import { create } from "zustand"

// Types for canvas positioning
export interface CardPosition {
	x: number
	y: number
}

export type CardPositions = Record<string, CardPosition>

// Main canvas state interface
export interface CanvasState {
	// Document IDs placed on the canvas (document.id or customId not needed here)
	placedDocumentIds: string[]
	// Raw selected docs set for scoping chat
	scopedDocumentIds: string[]
	// Card positions {documentId: {x, y}}
	cardPositions: CardPositions

	// Selection state for bulk operations
	selectedDocumentIds: string[]

	// Document management actions
	setPlacedDocumentIds: (ids: string[]) => void
	addPlacedDocuments: (ids: string[]) => void
	removePlacedDocument: (id: string) => void
	clearCanvas: () => void

	// Scope management actions
	setScopedDocumentIds: (ids: string[]) => void
	clearScope: () => void

	// Position management actions
	updateCardPosition: (id: string, x: number, y: number) => void
	setCardPositions: (positions: CardPositions) => void
	clearCardPositions: () => void

	// Selection actions
	setSelectedDocumentIds: (ids: string[]) => void
	clearSelection: () => void
	toggleSelection: (id: string) => void
	removeSelected: () => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
	placedDocumentIds: [],
	scopedDocumentIds: [],
	cardPositions: {},
	selectedDocumentIds: [],

	// Document management actions
	setPlacedDocumentIds: (ids: string[]) => {
		const uniqueIds = Array.from(new Set(ids))
		set({ placedDocumentIds: uniqueIds })
	},

	addPlacedDocuments: (ids: string[]) => {
		set((state) => ({
			placedDocumentIds: Array.from(
				new Set([...state.placedDocumentIds, ...ids]),
			),
		}))
	},

	removePlacedDocument: (id: string) => {
		const state = get()
		const newPlacedIds = state.placedDocumentIds.filter((docId) => docId !== id)
		const newScopedIds = state.scopedDocumentIds.filter((docId) => docId !== id)
		const newPositions = { ...state.cardPositions }
		delete newPositions[id]
		const newSelectedIds = state.selectedDocumentIds.filter(
			(docId) => docId !== id,
		)

		set({
			placedDocumentIds: newPlacedIds,
			scopedDocumentIds: newScopedIds,
			cardPositions: newPositions,
			selectedDocumentIds: newSelectedIds,
		})
	},

	clearCanvas: () => {
		set({
			placedDocumentIds: [],
			scopedDocumentIds: [],
			cardPositions: {},
			selectedDocumentIds: [],
		})
	},

	// Scope management actions
	setScopedDocumentIds: (ids: string[]) => {
		const uniqueIds = Array.from(new Set(ids))
		set({ scopedDocumentIds: uniqueIds })
	},

	clearScope: () => set({ scopedDocumentIds: [] }),

	// Position management actions
	updateCardPosition: (id: string, x: number, y: number) => {
		const state = get()
		set({
			cardPositions: {
				...state.cardPositions,
				[id]: { x, y },
			},
		})
	},

	setCardPositions: (positions: CardPositions) => {
		set({ cardPositions: positions })
	},

	clearCardPositions: () => set({ cardPositions: {} }),

	// Selection management
	setSelectedDocumentIds: (ids: string[]) => {
		const unique = Array.from(new Set(ids))
		set({ selectedDocumentIds: unique })
	},
	clearSelection: () => set({ selectedDocumentIds: [] }),
	toggleSelection: (id: string) => {
		const current = new Set(get().selectedDocumentIds)
		if (current.has(id)) current.delete(id)
		else current.add(id)
		set({ selectedDocumentIds: Array.from(current) })
	},
	removeSelected: () => {
		const state = get()
		if (state.selectedDocumentIds.length === 0) return
		const selected = new Set(state.selectedDocumentIds)
		const newPlaced = state.placedDocumentIds.filter((id) => !selected.has(id))
		const newScoped = state.scopedDocumentIds.filter((id) => !selected.has(id))
		const newPositions: CardPositions = {}
		for (const [k, v] of Object.entries(state.cardPositions)) {
			if (!selected.has(k)) newPositions[k] = v
		}
		set({
			placedDocumentIds: newPlaced,
			scopedDocumentIds: newScoped,
			cardPositions: newPositions,
			selectedDocumentIds: [],
		})
	},
}))

// Convenience hook for canvas selection and document management
export function useCanvasSelection() {
	const placedDocumentIds = useCanvasStore((s) => s.placedDocumentIds)
	const scopedDocumentIds = useCanvasStore((s) => s.scopedDocumentIds)
	const selectedDocumentIds = useCanvasStore((s) => s.selectedDocumentIds)
	const setPlacedDocumentIds = useCanvasStore((s) => s.setPlacedDocumentIds)
	const addPlacedDocuments = useCanvasStore((s) => s.addPlacedDocuments)
	const removePlacedDocument = useCanvasStore((s) => s.removePlacedDocument)
	const clearCanvas = useCanvasStore((s) => s.clearCanvas)
	const setScopedDocumentIds = useCanvasStore((s) => s.setScopedDocumentIds)
	const clearScope = useCanvasStore((s) => s.clearScope)
	const setSelectedDocumentIds = useCanvasStore((s) => s.setSelectedDocumentIds)
	const clearSelection = useCanvasStore((s) => s.clearSelection)
	const toggleSelection = useCanvasStore((s) => s.toggleSelection)
	const removeSelected = useCanvasStore((s) => s.removeSelected)

	return {
		placedDocumentIds,
		scopedDocumentIds,
		selectedDocumentIds,
		setPlacedDocumentIds,
		addPlacedDocuments,
		removePlacedDocument,
		clearCanvas,
		setScopedDocumentIds,
		clearScope,
		setSelectedDocumentIds,
		clearSelection,
		toggleSelection,
		removeSelected,
	}
}

// Hook for canvas positioning operations
export function useCanvasPositions() {
	const cardPositions = useCanvasStore((s) => s.cardPositions)
	const updateCardPosition = useCanvasStore((s) => s.updateCardPosition)
	const setCardPositions = useCanvasStore((s) => s.setCardPositions)
	const clearCardPositions = useCanvasStore((s) => s.clearCardPositions)

	return {
		cardPositions,
		updateCardPosition,
		setCardPositions,
		clearCardPositions,
		getCardPosition: (id: string) => cardPositions[id],
	}
}

// Hook for checking if canvas has content
export function useCanvasState() {
	const hasPlacedDocuments = useCanvasStore(
		(s) => s.placedDocumentIds.length > 0,
	)
	const hasScopedDocuments = useCanvasStore(
		(s) => s.scopedDocumentIds.length > 0,
	)
	const placedCount = useCanvasStore((s) => s.placedDocumentIds.length)
	const scopedCount = useCanvasStore((s) => s.scopedDocumentIds.length)
	const selectedCount = useCanvasStore((s) => s.selectedDocumentIds.length)

	return {
		hasPlacedDocuments,
		hasScopedDocuments,
		placedCount,
		scopedCount,
		selectedCount,
		isEmpty: !hasPlacedDocuments,
	}
}

// Hook for checking if a specific document is on canvas
export function useIsDocumentOnCanvas(documentId: string) {
	return useCanvasStore((s) => s.placedDocumentIds.includes(documentId))
}

// Hook for checking if a document is scoped
export function useIsDocumentScoped(documentId: string) {
	return useCanvasStore((s) => s.scopedDocumentIds.includes(documentId))
}

// Hook for checking if a document is selected
export function useIsDocumentSelected(documentId: string) {
	return useCanvasStore((s) => s.selectedDocumentIds.includes(documentId))
}
