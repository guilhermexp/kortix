import { BACKEND_URL } from "@repo/lib/env"
import type {
	CreateFlagInput,
	EvaluationContext,
	EvaluationResult,
	FeatureFlag,
	FlagAuditLog,
	UpdateFlagInput,
} from "@repo/validation/feature-flags"

/**
 * Feature Flags Client Library
 * Client-side functions for feature flag management and evaluation
 */

interface FetchFlagsResponse {
	flags: FeatureFlag[]
}

interface FetchFlagResponse {
	flag: FeatureFlag
}

interface CreateFlagResponse {
	flag: FeatureFlag
}

interface UpdateFlagResponse {
	flag: FeatureFlag
}

interface DeleteFlagResponse {
	success: boolean
	flagId: string
}

interface FetchAuditLogResponse {
	auditLogs: FlagAuditLog[]
}

/**
 * Evaluate a feature flag for the current context
 */
export async function evaluateFlag(
	flagKey: string,
	organizationId: string,
	context?: EvaluationContext,
): Promise<EvaluationResult> {
	try {
		const response = await fetch(
			`${BACKEND_URL.replace(/\/$/, "")}/v3/feature-flags/evaluate`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify({
					flagKey,
					organizationId,
					context,
				}),
			},
		)

		if (!response.ok) {
			throw new Error(`Failed to evaluate flag: ${response.statusText}`)
		}

		const data = (await response.json()) as EvaluationResult
		return data
	} catch (error) {
		console.error("Error evaluating feature flag:", error)
		throw error
	}
}

/**
 * Fetch all feature flags for an organization
 */
export async function fetchFlags(): Promise<FeatureFlag[]> {
	try {
		const response = await fetch(
			`${BACKEND_URL.replace(/\/$/, "")}/v3/feature-flags`,
			{
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			},
		)

		if (!response.ok) {
			throw new Error(`Failed to fetch flags: ${response.statusText}`)
		}

		const data = (await response.json()) as FetchFlagsResponse
		return data.flags
	} catch (error) {
		console.error("Error fetching feature flags:", error)
		throw error
	}
}

/**
 * Fetch a single feature flag by ID
 */
export async function fetchFlag(flagId: string): Promise<FeatureFlag | null> {
	try {
		const response = await fetch(
			`${BACKEND_URL.replace(/\/$/, "")}/v3/feature-flags/${flagId}`,
			{
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			},
		)

		if (!response.ok) {
			if (response.status === 404) {
				return null
			}
			throw new Error(`Failed to fetch flag: ${response.statusText}`)
		}

		const data = (await response.json()) as FetchFlagResponse
		return data.flag
	} catch (error) {
		console.error("Error fetching feature flag:", error)
		throw error
	}
}

/**
 * Create a new feature flag
 */
export async function createFlag(
	data: CreateFlagInput,
): Promise<FeatureFlag> {
	try {
		const response = await fetch(
			`${BACKEND_URL.replace(/\/$/, "")}/v3/feature-flags`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify(data),
			},
		)

		if (!response.ok) {
			throw new Error(`Failed to create flag: ${response.statusText}`)
		}

		const result = (await response.json()) as CreateFlagResponse
		return result.flag
	} catch (error) {
		console.error("Error creating feature flag:", error)
		throw error
	}
}

/**
 * Update an existing feature flag
 */
export async function updateFlag(
	flagId: string,
	data: UpdateFlagInput,
): Promise<FeatureFlag> {
	try {
		const response = await fetch(
			`${BACKEND_URL.replace(/\/$/, "")}/v3/feature-flags/${flagId}`,
			{
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify(data),
			},
		)

		if (!response.ok) {
			throw new Error(`Failed to update flag: ${response.statusText}`)
		}

		const result = (await response.json()) as UpdateFlagResponse
		return result.flag
	} catch (error) {
		console.error("Error updating feature flag:", error)
		throw error
	}
}

/**
 * Delete a feature flag
 */
export async function deleteFlag(flagId: string): Promise<void> {
	try {
		const response = await fetch(
			`${BACKEND_URL.replace(/\/$/, "")}/v3/feature-flags/${flagId}`,
			{
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			},
		)

		if (!response.ok) {
			throw new Error(`Failed to delete flag: ${response.statusText}`)
		}
	} catch (error) {
		console.error("Error deleting feature flag:", error)
		throw error
	}
}

/**
 * Fetch audit log for a feature flag
 */
export async function fetchFlagAuditLog(
	flagId: string,
	limit?: number,
): Promise<FlagAuditLog[]> {
	try {
		const url = new URL(
			`${BACKEND_URL.replace(/\/$/, "")}/v3/feature-flags/${flagId}/audit`,
		)
		if (limit) {
			url.searchParams.set("limit", limit.toString())
		}

		const response = await fetch(url.toString(), {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})

		if (!response.ok) {
			throw new Error(`Failed to fetch audit log: ${response.statusText}`)
		}

		const data = (await response.json()) as FetchAuditLogResponse
		return data.auditLogs
	} catch (error) {
		console.error("Error fetching flag audit log:", error)
		throw error
	}
}
