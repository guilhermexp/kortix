"use client"

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react"
import { analytics } from "@/lib/analytics"

type ViewMode = "graph" | "graphEmpty" | "list" | "infinity"

interface ViewModeContextType {
	viewMode: ViewMode
	setViewMode: (mode: ViewMode) => void
	isInitialized: boolean
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(
	undefined,
)

const STORAGE_KEY = "memoryViewMode"

const persistViewMode = (value: ViewMode) => {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(STORAGE_KEY, value)
	} catch {
		// Ignore storage errors (e.g., private mode)
	}
}

const readStoredViewMode = (): ViewMode | null => {
	if (typeof window === "undefined") return null
	try {
		const storedValue = window.localStorage.getItem(STORAGE_KEY)
		return storedValue === "list" ||
			storedValue === "graph" ||
			storedValue === "graphEmpty" ||
			storedValue === "infinity"
			? storedValue
			: null
	} catch {
		return null
	}
}

const isMobileDevice = () => {
	if (typeof window === "undefined") return false
	return window.innerWidth < 768
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
	// Start with "list" as default for SSR and initial state
	const [viewMode, setViewModeState] = useState<ViewMode>("list")
	const [isInitialized, setIsInitialized] = useState(false)

	// Load preferences on the client side
	useEffect(() => {
		if (!isInitialized) {
			// Always start with "list" view - ignore saved preferences
			// This ensures consistent initial experience
			setViewModeState("list")
			persistViewMode("list")
			setIsInitialized(true)
		}
	}, [isInitialized])

	// Save to cookie whenever view mode changes
	const handleSetViewMode = (mode: ViewMode) => {
		analytics.viewModeChanged(mode)
		setViewModeState(mode)
		persistViewMode(mode)
	}

	return (
		<ViewModeContext.Provider
			value={{
				viewMode,
				setViewMode: handleSetViewMode,
				isInitialized,
			}}
		>
			{children}
		</ViewModeContext.Provider>
	)
}

export function useViewMode() {
	const context = useContext(ViewModeContext)
	if (!context) {
		throw new Error("useViewMode must be used within a ViewModeProvider")
	}
	return context
}
