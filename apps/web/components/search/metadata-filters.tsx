"use client"

import { cn } from "@lib/utils"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select"
import { Filter, X } from "lucide-react"
import { useCallback, useMemo } from "react"

export interface MetadataFilterState {
	tags: string[]
	mentions: string[]
	properties: Record<string, unknown>
}

interface MetadataFiltersProps {
	filters: MetadataFilterState
	onFiltersChange: (filters: MetadataFilterState) => void
	availableTags?: string[]
	availableMentions?: string[]
	availableProperties?: string[]
	className?: string
}

export function MetadataFilters({
	filters,
	onFiltersChange,
	availableTags = [],
	availableMentions = [],
	availableProperties = [],
	className,
}: MetadataFiltersProps) {
	// Check if any filters are active
	const hasActiveFilters = useMemo(() => {
		return (
			filters.tags.length > 0 ||
			filters.mentions.length > 0 ||
			Object.keys(filters.properties).length > 0
		)
	}, [filters])

	// Handle tag selection
	const handleTagSelect = useCallback(
		(tag: string) => {
			const newTags = filters.tags.includes(tag)
				? filters.tags.filter((t) => t !== tag)
				: [...filters.tags, tag]
			onFiltersChange({ ...filters, tags: newTags })
		},
		[filters, onFiltersChange],
	)

	// Handle mention selection
	const handleMentionSelect = useCallback(
		(mention: string) => {
			const newMentions = filters.mentions.includes(mention)
				? filters.mentions.filter((m) => m !== mention)
				: [...filters.mentions, mention]
			onFiltersChange({ ...filters, mentions: newMentions })
		},
		[filters, onFiltersChange],
	)

	// Handle property selection
	const handlePropertySelect = useCallback(
		(property: string) => {
			const newProperties = { ...filters.properties }
			if (property in newProperties) {
				delete newProperties[property]
			} else {
				newProperties[property] = true
			}
			onFiltersChange({ ...filters, properties: newProperties })
		},
		[filters, onFiltersChange],
	)

	// Clear all filters
	const handleClearFilters = useCallback(() => {
		onFiltersChange({
			tags: [],
			mentions: [],
			properties: {},
		})
	}, [onFiltersChange])

	// Remove individual tag
	const handleRemoveTag = useCallback(
		(tag: string) => {
			onFiltersChange({
				...filters,
				tags: filters.tags.filter((t) => t !== tag),
			})
		},
		[filters, onFiltersChange],
	)

	// Remove individual mention
	const handleRemoveMention = useCallback(
		(mention: string) => {
			onFiltersChange({
				...filters,
				mentions: filters.mentions.filter((m) => m !== mention),
			})
		},
		[filters, onFiltersChange],
	)

	// Remove individual property
	const handleRemoveProperty = useCallback(
		(property: string) => {
			const newProperties = { ...filters.properties }
			delete newProperties[property]
			onFiltersChange({
				...filters,
				properties: newProperties,
			})
		},
		[filters, onFiltersChange],
	)

	return (
		<div className={cn("space-y-3", className)}>
			{/* Filter Controls */}
			<div className="flex flex-wrap items-center gap-2">
				<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
					<Filter className="h-4 w-4" />
					<span className="font-medium">Filters:</span>
				</div>

				{/* Tag Filter */}
				{availableTags.length > 0 && (
					<Select onValueChange={handleTagSelect} value="">
						<SelectTrigger
							className="w-[140px] h-8 text-xs"
							size="sm"
						>
							<SelectValue placeholder="Add tag..." />
						</SelectTrigger>
						<SelectContent>
							{availableTags
								.filter((tag) => !filters.tags.includes(tag))
								.map((tag) => (
									<SelectItem key={tag} value={tag}>
										{tag}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				)}

				{/* Mention Filter */}
				{availableMentions.length > 0 && (
					<Select onValueChange={handleMentionSelect} value="">
						<SelectTrigger
							className="w-[140px] h-8 text-xs"
							size="sm"
						>
							<SelectValue placeholder="Add mention..." />
						</SelectTrigger>
						<SelectContent>
							{availableMentions
								.filter((mention) => !filters.mentions.includes(mention))
								.map((mention) => (
									<SelectItem key={mention} value={mention}>
										@{mention}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				)}

				{/* Property Filter */}
				{availableProperties.length > 0 && (
					<Select onValueChange={handlePropertySelect} value="">
						<SelectTrigger
							className="w-[140px] h-8 text-xs"
							size="sm"
						>
							<SelectValue placeholder="Add property..." />
						</SelectTrigger>
						<SelectContent>
							{availableProperties
								.filter((prop) => !(prop in filters.properties))
								.map((prop) => (
									<SelectItem key={prop} value={prop}>
										{prop}
									</SelectItem>
								))}
						</SelectContent>
					</Select>
				)}

				{/* Clear Filters Button */}
				{hasActiveFilters && (
					<Button
						className="h-8 text-xs gap-1"
						onClick={handleClearFilters}
						size="sm"
						variant="ghost"
					>
						<X className="h-3 w-3" />
						Clear all
					</Button>
				)}
			</div>

			{/* Active Filters Display */}
			{hasActiveFilters && (
				<div className="flex flex-wrap gap-2">
					{/* Tag Badges */}
					{filters.tags.map((tag) => (
						<Badge
							className="gap-1.5 pr-1 cursor-pointer hover:bg-primary/80"
							key={tag}
							onClick={() => handleRemoveTag(tag)}
							variant="default"
						>
							<span>#{tag}</span>
							<X className="h-3 w-3" />
						</Badge>
					))}

					{/* Mention Badges */}
					{filters.mentions.map((mention) => (
						<Badge
							className="gap-1.5 pr-1 cursor-pointer hover:bg-secondary/80"
							key={mention}
							onClick={() => handleRemoveMention(mention)}
							variant="secondary"
						>
							<span>@{mention}</span>
							<X className="h-3 w-3" />
						</Badge>
					))}

					{/* Property Badges */}
					{Object.keys(filters.properties).map((property) => (
						<Badge
							className="gap-1.5 pr-1 cursor-pointer hover:bg-accent"
							key={property}
							onClick={() => handleRemoveProperty(property)}
							variant="outline"
						>
							<span>{property}</span>
							<X className="h-3 w-3" />
						</Badge>
					))}
				</div>
			)}
		</div>
	)
}
