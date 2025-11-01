"use client"

import { useState, useEffect } from "react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select"
import { Sparkles } from "lucide-react"

export type ProviderId = "glm" | "minimax" | "anthropic"

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
		displayName: "GLM-4.6",
		description: "Fast and balanced general-purpose model",
	},
	{
		id: "minimax",
		name: "MiniMax",
		displayName: "MiniMax-M2",
		description: "Advanced reasoning and creative tasks",
	},
	{
		id: "anthropic",
		name: "Anthropic",
		displayName: "Haiku 4.5",
		description: "Claude's fastest model with frontier intelligence",
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
	const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
		value || "glm"
	)

	useEffect(() => {
		if (value && value !== selectedProvider) {
			setSelectedProvider(value)
		}
	}, [value])

	const handleChange = (newProvider: string) => {
		const providerId = newProvider as ProviderId
		setSelectedProvider(providerId)
		if (onChange) {
			onChange(providerId)
		}

		// Save to localStorage for persistence
		if (typeof window !== "undefined") {
			localStorage.setItem("preferred_provider", providerId)
		}
	}

	const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider)

	return (
		<div className="flex items-center gap-1.5">
			<Sparkles className="h-3 w-3 text-white/40" />
			<Select
				value={selectedProvider}
				onValueChange={handleChange}
				disabled={disabled}
			>
				<SelectTrigger className="h-6 px-2 w-[140px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-white/90 text-xs">
					<SelectValue placeholder="Select provider">
						{currentProvider && (
							<span className="flex items-center gap-1">
								<span className="font-medium text-[11px]">{currentProvider.name}</span>
								<span className="text-white/40 text-[10px]">
									{currentProvider.displayName}
								</span>
							</span>
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent className="bg-[#0f1419] backdrop-blur-xl border-white/10">
					{PROVIDERS.map((provider) => (
						<SelectItem
							key={provider.id}
							value={provider.id}
							className="text-white hover:bg-white/10 focus:bg-white/10 cursor-pointer text-xs"
						>
							<div className="flex flex-col gap-0.5">
								<div className="flex items-center gap-1.5">
									<span className="font-medium text-xs">{provider.name}</span>
									<span className="text-[10px] text-white/50 font-mono">
										{provider.displayName}
									</span>
								</div>
								<span className="text-[10px] text-white/40">
									{provider.description}
								</span>
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
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
			const saved = localStorage.getItem("preferred_provider") as ProviderId | null
			if (saved && (saved === "glm" || saved === "minimax" || saved === "anthropic")) {
				setProvider(saved)
			}
		}
	}, [])

	return {
		provider,
		setProvider,
	}
}
