"use client"

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select"
import { Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

export type ProviderId = "glm" | "minimax" | "anthropic" | "kimi"

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
	{
		id: "kimi",
		name: "Kimi",
		displayName: "Kimi K2 Thinking",
		description: "Advanced coding and reasoning with thinking mode",
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
		value || "kimi",
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
			<Select
				disabled={disabled}
				onValueChange={handleChange}
				value={selectedProvider}
			>
				<SelectTrigger className="h-6 px-1.5 w-fit bg-transparent hover:bg-transparent border-0 shadow-none text-muted-foreground hover:text-foreground text-xs font-normal gap-1">
					<SelectValue placeholder="Select provider">
						{currentProvider && (
							<span className="text-[11px]">{currentProvider.displayName}</span>
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent className="bg-background backdrop-blur-xl border-border">
					{PROVIDERS.map((provider) => (
						<SelectItem
							className="text-foreground hover:bg-muted focus:bg-muted cursor-pointer text-xs"
							key={provider.id}
							value={provider.id}
						>
							<div className="flex flex-col gap-0.5">
								<div className="flex items-center gap-1.5">
									<span className="font-medium text-xs">{provider.name}</span>
									<span className="text-[10px] text-muted-foreground font-mono">
										{provider.displayName}
									</span>
								</div>
								<span className="text-[10px] text-muted-foreground">
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
	const [provider, setProvider] = useState<ProviderId>("kimi")

	// Load from localStorage on mount
	useEffect(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem(
				"preferred_provider",
			) as ProviderId | null
			if (
				saved &&
				(saved === "glm" ||
					saved === "minimax" ||
					saved === "anthropic" ||
					saved === "kimi")
			) {
				setProvider(saved)
			}
		}
	}, [])

	return {
		provider,
		setProvider,
	}
}
