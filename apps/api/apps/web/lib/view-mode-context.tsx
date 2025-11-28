"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ViewMode = "graph" | "infinity" | "list"

interface ViewModeState {
	viewMode: ViewMode
	setViewMode: (mode: ViewMode) => void
}

const useViewModeStore = create<ViewModeState>()(
	persist(
		(set) => ({
			viewMode: "graph",
			setViewMode: (mode) => set({ viewMode: mode }),
		}),
		{
			name: "supermemory-view-mode",
		},
	),
)

export function useViewMode() {
	return useViewModeStore()
}
