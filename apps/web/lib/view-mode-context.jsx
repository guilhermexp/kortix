"use client"

exports.__esModule = true
exports.useViewMode = exports.ViewModeProvider = void 0
var react_1 = require("react")
var analytics_1 = require("@/lib/analytics")
var ViewModeContext = (0, react_1.createContext)(undefined)
var STORAGE_KEY = "memoryViewMode"
var persistViewMode = (value) => {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(STORAGE_KEY, value)
	} catch (_a) {
		// Ignore storage errors (e.g., private mode)
	}
}
var readStoredViewMode = () => {
	if (typeof window === "undefined") return null
	try {
		var storedValue = window.localStorage.getItem(STORAGE_KEY)
		return storedValue === "list" || storedValue === "graph"
			? storedValue
			: null
	} catch (_a) {
		return null
	}
}
var isMobileDevice = () => {
	if (typeof window === "undefined") return false
	return window.innerWidth < 768
}
function ViewModeProvider(_a) {
	var children = _a.children
	// Start with a default that works for SSR
	var _b = (0, react_1.useState)("graph"),
		viewMode = _b[0],
		setViewModeState = _b[1]
	var _c = (0, react_1.useState)(false),
		isInitialized = _c[0],
		setIsInitialized = _c[1]
	// Load preferences on the client side
	;(0, react_1.useEffect)(() => {
		if (!isInitialized) {
			// Check for saved preference first
			var savedMode = readStoredViewMode()
			if (savedMode === "list" || savedMode === "graph") {
				setViewModeState(savedMode)
			} else {
				// If no saved preference, default to list on mobile, graph on desktop
				setViewModeState(isMobileDevice() ? "list" : "graph")
			}
			setIsInitialized(true)
		}
	}, [isInitialized])
	// Save to cookie whenever view mode changes
	var handleSetViewMode = (mode) => {
		analytics_1.analytics.viewModeChanged(mode)
		setViewModeState(mode)
		persistViewMode(mode)
	}
	return (
		<ViewModeContext.Provider
			value={{
				viewMode: viewMode,
				setViewMode: handleSetViewMode,
				isInitialized: isInitialized,
			}}
		>
			{children}
		</ViewModeContext.Provider>
	)
}
exports.ViewModeProvider = ViewModeProvider
function useViewMode() {
	var context = (0, react_1.useContext)(ViewModeContext)
	if (!context) {
		throw new Error("useViewMode must be used within a ViewModeProvider")
	}
	return context
}
exports.useViewMode = useViewMode
