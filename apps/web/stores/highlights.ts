import { create } from "zustand"

type HighlightState = {
	documentIds: string[]
	lastUpdated: number
	setDocumentIds: (ids: string[]) => void
	appendDocumentIds: (ids: string[]) => void
	clear: () => void
}

const useHighlightsStore = create<HighlightState>((set) => ({
	documentIds: [],
	lastUpdated: 0,
	setDocumentIds: (ids) =>
		set(() => ({
			documentIds: Array.from(
				new Set(
					(ids ?? []).filter(
						(id): id is string => typeof id === "string" && id.length > 0,
					),
				),
			),
			lastUpdated: Date.now(),
		})),
	appendDocumentIds: (ids) =>
		set((state) => ({
			documentIds: Array.from(
				new Set([
					...state.documentIds,
					...(ids ?? []).filter(
						(id): id is string => typeof id === "string" && id.length > 0,
					),
				]),
			),
			lastUpdated: Date.now(),
		})),
	clear: () =>
		set(() => ({
			documentIds: [],
			lastUpdated: Date.now(),
		})),
}))

export function useGraphHighlights() {
	const documentIds = useHighlightsStore((state) => state.documentIds)
	const lastUpdated = useHighlightsStore((state) => state.lastUpdated)
	const setDocumentIds = useHighlightsStore((state) => state.setDocumentIds)
	const appendDocumentIds = useHighlightsStore(
		(state) => state.appendDocumentIds,
	)
	const clear = useHighlightsStore((state) => state.clear)

	return {
		documentIds,
		lastUpdated,
		setDocumentIds,
		appendDocumentIds,
		clear,
	}
}
