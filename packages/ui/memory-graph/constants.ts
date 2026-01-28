// Re-export getColors from canvas-constants for backwards compatibility
// Helper to check if we're in dark mode
const isDarkMode = (): boolean => {
	if (typeof document === "undefined") return true
	return document.documentElement.classList.contains("dark")
}

// Enhanced glass-morphism color palette with theme support
export const getColors = () => {
	const dark = isDarkMode()

	return {
		background: {
			primary: dark ? "#0f1419" : "#ffffff",
			secondary: dark ? "#1a1f29" : "#f8f9fa",
			accent: dark ? "#252a35" : "#f1f3f5",
		},
		document: {
			primary: dark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)",
			secondary: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
			accent: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)",
			border: dark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)",
			glow: dark ? "rgba(147, 197, 253, 0.25)" : "rgba(59, 130, 246, 0.25)",
		},
		memory: {
			primary: dark ? "rgba(147, 197, 253, 0.05)" : "rgba(59, 130, 246, 0.05)",
			secondary: dark
				? "rgba(147, 197, 253, 0.10)"
				: "rgba(59, 130, 246, 0.10)",
			accent: dark ? "rgba(147, 197, 253, 0.15)" : "rgba(59, 130, 246, 0.15)",
			border: dark ? "rgba(147, 197, 253, 0.20)" : "rgba(59, 130, 246, 0.20)",
			glow: dark ? "rgba(147, 197, 253, 0.30)" : "rgba(59, 130, 246, 0.30)",
		},
		connection: {
			weak: dark ? "rgba(148, 163, 184, 0)" : "rgba(100, 116, 139, 0)",
			memory: dark ? "rgba(148, 163, 184, 0.15)" : "rgba(100, 116, 139, 0.15)",
			medium: dark ? "rgba(148, 163, 184, 0.08)" : "rgba(100, 116, 139, 0.08)",
			strong: dark ? "rgba(148, 163, 184, 0.20)" : "rgba(100, 116, 139, 0.20)",
		},
		text: {
			primary: dark ? "#ffffff" : "#0a0a0a",
			secondary: dark ? "#e2e8f0" : "#3f3f46",
			muted: dark ? "#94a3b8" : "#71717a",
			error: dark ? "#ef4444" : "#dc2626",
		},
		accent: {
			primary: "rgba(59, 130, 246, 0.7)",
			secondary: "rgba(99, 102, 241, 0.6)",
			glow: dark ? "rgba(147, 197, 253, 0.6)" : "rgba(59, 130, 246, 0.6)",
			amber: "rgba(251, 165, 36, 0.8)",
			emerald: "rgba(16, 185, 129, 0.4)",
		},
		status: {
			forgotten: "rgba(220, 38, 38, 0.15)",
			expiring: "rgba(251, 165, 36, 0.8)",
			new: "rgba(16, 185, 129, 0.4)",
		},
		relations: {
			updates: "rgba(147, 77, 253, 0.5)",
			extends: "rgba(16, 185, 129, 0.5)",
			derives: "rgba(147, 197, 253, 0.5)",
		},
	}
}

export const colors = getColors()
