"use client"

import { useSession } from "@lib/auth"
import { useQuery } from "@tanstack/react-query"
import type { EvaluationContext, FeatureFlag } from "@repo/validation/feature-flags"
import { evaluateFlag, fetchFlags } from "@/lib/feature-flags"

/**
 * Hook to fetch all feature flags for the current organization
 * Uses React Query for caching and automatic refetching
 *
 * @returns Object containing flags array, loading state, and error
 */
export function useFeatureFlags() {
	const session = useSession()
	const organizationId = session.data?.session?.organizationId

	return useQuery({
		queryKey: ["feature-flags", organizationId],
		queryFn: async () => {
			if (!organizationId) {
				throw new Error("No organization ID available")
			}
			return fetchFlags()
		},
		enabled: !!organizationId,
		staleTime: 5 * 60 * 1000, // 5 minutes
		refetchOnWindowFocus: true,
	})
}

/**
 * Hook to evaluate a single feature flag for the current user/context
 * Returns a boolean indicating whether the flag is enabled
 * Uses React Query for caching to meet <10ms performance requirement
 *
 * @param flagKey - The unique key of the feature flag to evaluate
 * @param context - Optional evaluation context (userId, userRole, environment, etc.)
 * @returns Object containing enabled boolean, loading state, and error
 */
export function useFeatureFlag(
	flagKey: string,
	context?: Omit<EvaluationContext, "organizationId">,
) {
	const session = useSession()
	const organizationId = session.data?.session?.organizationId
	const userId = session.data?.user?.id

	const { data, isLoading, error } = useQuery({
		queryKey: ["feature-flag-evaluation", flagKey, organizationId, userId, context],
		queryFn: async () => {
			if (!organizationId) {
				throw new Error("No organization ID available")
			}

			const evaluationContext: EvaluationContext = {
				organizationId,
				userId,
				...context,
			}

			return evaluateFlag(flagKey, organizationId, evaluationContext)
		},
		enabled: !!organizationId && !!flagKey,
		staleTime: 2 * 60 * 1000, // 2 minutes
		refetchOnWindowFocus: false,
		// Retry on failure but with exponential backoff
		retry: 2,
	})

	return {
		enabled: data?.enabled ?? false,
		isLoading,
		error,
		// Include additional evaluation metadata
		reason: data?.reason,
		ruleId: data?.ruleId,
	}
}
