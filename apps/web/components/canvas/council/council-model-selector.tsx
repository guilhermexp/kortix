"use client"

import { useState, useCallback, useMemo } from "react"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
} from "@/components/ui/command"
import { ChevronDown, Check, Loader2 } from "lucide-react"
import { useAvailableModels } from "./use-available-models"
import { getModelColor, getShortModelName } from "./council-types"
import type { AvailableModel } from "./council-types"

interface CouncilModelSelectorProps {
	currentModel: string
	fullModelId?: string
	onModelChange: (modelId: string) => void
	disabled?: boolean
}

// Group models by provider
function groupModelsByProvider(
	models: AvailableModel[]
): Record<string, AvailableModel[]> {
	const groups: Record<string, AvailableModel[]> = {}

	for (const model of models) {
		const provider = model.id.split("/")[0] || "other"
		if (!groups[provider]) {
			groups[provider] = []
		}
		groups[provider].push(model)
	}

	// Sort providers alphabetically
	const sortedGroups: Record<string, AvailableModel[]> = {}
	for (const key of Object.keys(groups).sort()) {
		sortedGroups[key] = groups[key]
	}

	return sortedGroups
}

export function CouncilModelSelector({
	currentModel,
	fullModelId,
	onModelChange,
	disabled = false,
}: CouncilModelSelectorProps) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState("")
	const { models, isLoading, error } = useAvailableModels()

	const modelColor = getModelColor(fullModelId || currentModel)

	// Filter models based on search
	const filteredModels = useMemo(() => {
		if (!search) return models
		const searchLower = search.toLowerCase()
		return models.filter(
			(m) =>
				m.id.toLowerCase().includes(searchLower) ||
				m.name.toLowerCase().includes(searchLower)
		)
	}, [models, search])

	// Group filtered models
	const groupedModels = useMemo(
		() => groupModelsByProvider(filteredModels),
		[filteredModels]
	)

	const handleSelect = useCallback(
		(modelId: string) => {
			if (modelId !== fullModelId) {
				onModelChange(modelId)
			}
			setOpen(false)
			setSearch("")
		},
		[fullModelId, onModelChange]
	)

	// Handle click to prevent TLDraw from capturing the event
	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		e.stopPropagation()
	}, [])

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					onPointerDown={handlePointerDown}
					disabled={disabled}
					className="council-model-selector-trigger"
					style={{ color: modelColor }}
				>
					<span>{currentModel}</span>
					<ChevronDown className="council-model-selector-chevron" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="council-model-selector-content"
				align="start"
				sideOffset={8}
				onPointerDownOutside={(e) => e.stopPropagation()}
				onInteractOutside={(e) => e.stopPropagation()}
			>
				<Command>
					<CommandInput
						placeholder="Search models..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="council-model-selector-list">
						{isLoading && (
							<div className="council-model-selector-loading">
								<Loader2 className="animate-spin" size={16} />
								<span>Loading models...</span>
							</div>
						)}

						{error && (
							<CommandEmpty>Failed to load models: {error}</CommandEmpty>
						)}

						{!isLoading && !error && filteredModels.length === 0 && (
							<CommandEmpty>No models found.</CommandEmpty>
						)}

						{Object.entries(groupedModels).map(([provider, providerModels]) => (
							<CommandGroup key={provider} heading={provider}>
								{providerModels.map((model) => (
									<CommandItem
										key={model.id}
										value={model.id}
										onSelect={() => handleSelect(model.id)}
										className="council-model-selector-item"
									>
										<div
											className="council-model-selector-color"
											style={{ backgroundColor: getModelColor(model.id) }}
										/>
										<div className="council-model-selector-info">
											<span className="council-model-selector-name">
												{getShortModelName(model.id)}
											</span>
											<span className="council-model-selector-id">
												{model.id}
											</span>
										</div>
										{model.id === fullModelId && (
											<Check className="council-model-selector-check" size={16} />
										)}
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</PopoverContent>

			<style>{`
				.council-model-selector-trigger {
					display: flex;
					align-items: center;
					gap: 4px;
					font-size: 20px;
					font-weight: 700;
					letter-spacing: -0.02em;
					text-transform: capitalize;
					background: none;
					border: none;
					cursor: pointer;
					padding: 4px 8px;
					margin: -4px -8px;
					border-radius: 8px;
					transition: background-color 0.15s ease;
				}

				.council-model-selector-trigger:hover {
					background: rgba(255, 255, 255, 0.1);
				}

				.council-model-selector-trigger:disabled {
					cursor: not-allowed;
					opacity: 0.5;
				}

				.council-model-selector-chevron {
					width: 16px;
					height: 16px;
					opacity: 0.6;
				}

				.council-model-selector-content {
					width: 360px;
					padding: 0;
					z-index: 9999;
				}

				.council-model-selector-list {
					max-height: 400px;
				}

				.council-model-selector-loading {
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 8px;
					padding: 24px;
					color: var(--muted-foreground);
				}

				.council-model-selector-item {
					display: flex;
					align-items: center;
					gap: 10px;
					padding: 8px 12px;
					cursor: pointer;
				}

				.council-model-selector-color {
					width: 8px;
					height: 8px;
					border-radius: 50%;
					flex-shrink: 0;
				}

				.council-model-selector-info {
					display: flex;
					flex-direction: column;
					gap: 2px;
					flex: 1;
					min-width: 0;
				}

				.council-model-selector-name {
					font-weight: 500;
					font-size: 14px;
				}

				.council-model-selector-id {
					font-size: 11px;
					color: var(--muted-foreground);
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}

				.council-model-selector-check {
					color: var(--primary);
					flex-shrink: 0;
				}
			`}</style>
		</Popover>
	)
}
