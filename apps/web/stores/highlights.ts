// Stub for graph highlights (graph feature removed)
// This file provides no-op functions for backwards compatibility

export function useGraphHighlights() {
	return {
		documentIds: [],
		lastUpdated: 0,
		setDocumentIds: (_ids: string[]) => {
			// No-op: graph feature removed
		},
		clear: () => {
			// No-op: graph feature removed
		},
	}
}
