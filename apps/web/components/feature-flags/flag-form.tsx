"use client"

import { createFlag, updateFlag } from "@/lib/feature-flags"
import { useSession } from "@lib/auth"
import { Button } from "@ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog"
import { Input } from "@ui/components/input"
import { Label } from "@ui/components/label"
import { Switch } from "@ui/components/switch"
import { Textarea } from "@ui/components/textarea"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { FeatureFlag } from "@repo/validation/feature-flags"
import { useState, useEffect } from "react"
import { toast } from "sonner"

interface FlagFormProps {
	open: boolean
	onClose: () => void
	flag?: FeatureFlag | null
}

/**
 * Form dialog for creating and editing feature flags
 * Handles validation and submission with React Query mutations
 */
export function FlagForm({ open, onClose, flag }: FlagFormProps) {
	const queryClient = useQueryClient()
	const session = useSession()
	const organizationId = session.data?.session?.organizationId

	const isEditing = !!flag

	// Form state
	const [formData, setFormData] = useState({
		key: flag?.key || "",
		name: flag?.name || "",
		description: flag?.description || "",
		enabled: flag?.enabled ?? false,
	})

	// Reset form when dialog opens/closes or flag changes
	const handleOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			onClose()
			// Reset form after dialog closes
			setTimeout(() => {
				setFormData({
					key: "",
					name: "",
					description: "",
					enabled: false,
				})
			}, 200)
		}
	}

	// Update form when flag prop changes
	useEffect(() => {
		if (flag) {
			setFormData({
				key: flag.key,
				name: flag.name,
				description: flag.description || "",
				enabled: flag.enabled,
			})
		}
	}, [flag])

	const createMutation = useMutation({
		mutationFn: async () => {
			if (!organizationId) {
				throw new Error("No organization ID available")
			}

			return createFlag({
				key: formData.key,
				name: formData.name,
				description: formData.description || undefined,
				enabled: formData.enabled,
				org_id: organizationId,
			})
		},
		onSuccess: () => {
			toast.success("Flag created successfully!")
			queryClient.invalidateQueries({ queryKey: ["feature-flags"] })
			handleOpenChange(false)
		},
		onError: (error) => {
			toast.error("Failed to create flag", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	const updateMutation = useMutation({
		mutationFn: async () => {
			if (!flag) {
				throw new Error("No flag to update")
			}

			return updateFlag(flag.id, {
				name: formData.name,
				description: formData.description || undefined,
				enabled: formData.enabled,
			})
		},
		onSuccess: () => {
			toast.success("Flag updated successfully!")
			queryClient.invalidateQueries({ queryKey: ["feature-flags"] })
			handleOpenChange(false)
		},
		onError: (error) => {
			toast.error("Failed to update flag", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()

		if (!formData.name.trim()) {
			toast.error("Flag name is required")
			return
		}

		if (!isEditing && !formData.key.trim()) {
			toast.error("Flag key is required")
			return
		}

		if (!isEditing && !/^[a-z0-9_-]+$/.test(formData.key)) {
			toast.error("Flag key must contain only lowercase letters, numbers, underscores, and hyphens")
			return
		}

		if (isEditing) {
			updateMutation.mutate()
		} else {
			createMutation.mutate()
		}
	}

	const isPending = createMutation.isPending || updateMutation.isPending

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Feature Flag" : "Create Feature Flag"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Update the feature flag settings."
							: "Create a new feature flag for controlled rollouts and A/B testing."}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						{!isEditing && (
							<div className="grid gap-2">
								<Label htmlFor="key">
									Key <span className="text-destructive">*</span>
								</Label>
								<Input
									id="key"
									placeholder="new_dashboard"
									value={formData.key}
									onChange={(e) =>
										setFormData({ ...formData, key: e.target.value })
									}
									disabled={isPending}
									aria-invalid={!formData.key.trim()}
								/>
								<p className="text-muted-foreground text-xs">
									Unique identifier (lowercase letters, numbers, underscores, hyphens only)
								</p>
							</div>
						)}

						<div className="grid gap-2">
							<Label htmlFor="name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="name"
								placeholder="New Dashboard"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								disabled={isPending}
								aria-invalid={!formData.name.trim()}
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="description">Description</Label>
							<Textarea
								id="description"
								placeholder="Enables the redesigned dashboard with improved analytics"
								value={formData.description}
								onChange={(e) =>
									setFormData({ ...formData, description: e.target.value })
								}
								disabled={isPending}
							/>
						</div>

						<div className="flex items-center gap-2">
							<Switch
								id="enabled"
								checked={formData.enabled}
								onCheckedChange={(checked) =>
									setFormData({ ...formData, enabled: checked })
								}
								disabled={isPending}
							/>
							<Label htmlFor="enabled">Enable flag immediately</Label>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleOpenChange(false)}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Saving..." : isEditing ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
