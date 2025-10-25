import { useCallback, useEffect } from "react"

interface UseUnsavedChangesOptions {
	hasUnsavedChanges: boolean
	message?: string
}

/**
 * Hook to detect and warn about unsaved changes
 * - Warns on browser refresh/close
 * - Warns on navigation away from page
 */
export function useUnsavedChanges({
	hasUnsavedChanges,
	message = "You have unsaved changes. Are you sure you want to leave?",
}: UseUnsavedChangesOptions) {
	// Warn on browser refresh/close
	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges) {
				e.preventDefault()
				// Chrome requires returnValue to be set
				e.returnValue = message
				return message
			}
		}

		window.addEventListener("beforeunload", handleBeforeUnload)

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload)
		}
	}, [hasUnsavedChanges, message])

	// Warn on navigation (for client-side routing)
	const confirmNavigation = useCallback(() => {
		if (hasUnsavedChanges) {
			return window.confirm(message)
		}
		return true
	}, [hasUnsavedChanges, message])

	return {
		confirmNavigation,
	}
}
