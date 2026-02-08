"use client"

import { updateFlag } from "@/lib/feature-flags"
import { Switch } from "@ui/components/switch"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { FeatureFlag } from "@repo/validation/feature-flags"
import { toast } from "sonner"

interface FlagToggleProps {
	flag: FeatureFlag
	disabled?: boolean
}

/**
 * Toggle switch for enabling/disabling feature flags
 * Updates the flag state and invalidates queries on success
 */
export function FlagToggle({ flag, disabled = false }: FlagToggleProps) {
	const queryClient = useQueryClient()

	const toggleMutation = useMutation({
		mutationFn: async (enabled: boolean) => {
			return updateFlag(flag.id, { enabled })
		},
		onSuccess: (updatedFlag) => {
			toast.success(
				updatedFlag.enabled ? "Flag enabled" : "Flag disabled",
			)
			queryClient.invalidateQueries({ queryKey: ["feature-flags"] })
		},
		onError: (error) => {
			toast.error("Failed to update flag", {
				description: error instanceof Error ? error.message : "Unknown error",
			})
		},
	})

	const handleToggle = (checked: boolean) => {
		toggleMutation.mutate(checked)
	}

	return (
		<Switch
			checked={flag.enabled}
			disabled={disabled || toggleMutation.isPending}
			onCheckedChange={handleToggle}
			aria-label={`Toggle ${flag.name}`}
		/>
	)
}
