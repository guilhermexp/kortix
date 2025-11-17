"use client"

import { Button } from "@repo/ui/components/button"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

interface ThemeToggleProps {
	className?: string
	showLabel?: boolean
}

/**
 * ThemeToggle component provides a button to switch between light and dark themes.
 *
 * Features:
 * - Smooth icon transitions with rotation animations
 * - Hydration mismatch prevention using mounted state
 * - Persistent theme preference via next-themes
 * - Accessible with keyboard navigation and screen reader support
 *
 * @param className - Optional className for styling
 * @param showLabel - Whether to show the theme label text (default: false)
 */
export function ThemeToggle({
	className,
	showLabel = false,
}: ThemeToggleProps) {
	const { theme, setTheme } = useTheme()
	const [mounted, setMounted] = useState(false)

	// Prevent hydration mismatch by only rendering after client-side mount
	useEffect(() => {
		setMounted(true)
	}, [])

	// Return placeholder button during SSR to prevent hydration mismatch
	if (!mounted) {
		return (
			<Button
				className={className}
				disabled
				size={showLabel ? "default" : "icon"}
				variant="ghost"
			/>
		)
	}

	const toggleTheme = () => {
		setTheme(theme === "dark" ? "light" : "dark")
	}

	return (
		<Button
			aria-label="Toggle theme"
			className={className}
			onClick={toggleTheme}
			size={showLabel ? "default" : "icon"}
			type="button"
			variant="ghost"
		>
			<Sun className="h-[1rem] w-[1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
			<Moon className="absolute h-[1rem] w-[1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
			{showLabel && (
				<span className="ml-2">{theme === "dark" ? "Light" : "Dark"} Mode</span>
			)}
			<span className="sr-only">Toggle theme</span>
		</Button>
	)
}
