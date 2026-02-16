"use client"

import { useEffect, useState } from "react"

export type ProviderId = "kimi"

interface ProviderConfig {
	id: ProviderId
	name: string
	displayName: string
	description: string
}

const PROVIDERS: ProviderConfig[] = [
	{
		id: "kimi",
		name: "Kimi",
		displayName: "K2.5",
		description: "Fast and balanced coding model by Moonshot AI",
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
	const selectedProvider = value || "kimi"
	const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider)

	// With a single provider, render as a static label
	return (
		<div className="flex items-center gap-1.5">
			<span className="h-6 px-1.5 inline-flex items-center text-muted-foreground text-[11px] font-normal">
				{currentProvider?.displayName ?? "K2.5"}
			</span>
		</div>
	)
}

/**
 * Hook to manage provider selection with persistence
 */
export function useProviderSelection() {
	const [provider, setProvider] = useState<ProviderId>("kimi")

	// Load from localStorage on mount, resetting stale values (e.g. "glm")
	useEffect(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("preferred_provider")
			if (saved === "kimi") {
				setProvider(saved)
			} else {
				// Reset stale provider values to kimi
				localStorage.setItem("preferred_provider", "kimi")
			}
		}
	}, [])

	return {
		provider,
		setProvider,
	}
}
