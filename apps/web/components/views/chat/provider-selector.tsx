"use client"

import { useEffect, useState } from "react"

export type ProviderId = "glm"

interface ProviderConfig {
	id: ProviderId
	name: string
	displayName: string
	description: string
}

const PROVIDERS: ProviderConfig[] = [
	{
		id: "glm",
		name: "Z.AI",
		displayName: "GLM-4.6V",
		description: "Fast and balanced general-purpose model with vision",
	},
]

interface ProviderSelectorProps {
	value?: ProviderId
	onChange?: (provider: ProviderId) => void
	disabled?: boolean
}

export function ProviderSelector({
	value,
	onChange,
	disabled = false,
}: ProviderSelectorProps) {
	const selectedProvider = value || "glm"
	const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider)

	// With a single provider, render as a static label
	return (
		<div className="flex items-center gap-1.5">
			<span className="h-6 px-1.5 inline-flex items-center text-muted-foreground text-[11px] font-normal">
				{currentProvider?.displayName ?? "GLM-4.6V"}
			</span>
		</div>
	)
}

/**
 * Hook to manage provider selection with persistence
 */
export function useProviderSelection() {
	const [provider, setProvider] = useState<ProviderId>("glm")

	// Load from localStorage on mount
	useEffect(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem(
				"preferred_provider",
			) as ProviderId | null
			if (saved && saved === "glm") {
				setProvider(saved)
			}
		}
	}, [])

	return {
		provider,
		setProvider,
	}
}
