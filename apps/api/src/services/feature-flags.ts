/**
 * Feature Flag Service
 *
 * Provides feature flag evaluation with caching for performance (<10ms requirement)
 * Supports user segment targeting, percentage rollouts, and custom rules
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { documentCache } from "./query-cache"

/**
 * Feature flag from database
 */
interface FeatureFlag {
	id: string
	key: string
	name: string
	description: string | null
	enabled: boolean
	org_id: string
	metadata: Record<string, any>
	created_at: string
	updated_at: string
}

/**
 * Flag rule for targeting and rollouts
 */
interface FlagRule {
	id: string
	flag_id: string
	type: "user_segment" | "percentage" | "custom" | "user_id" | "environment"
	conditions: Record<string, any>
	rollout_percentage: number | null
	priority: number
	enabled: boolean
	created_at: string
	updated_at: string
}

/**
 * Audit log entry for flag changes
 */
interface FlagAuditLog {
	id: string
	flag_id: string
	user_id: string | null
	action:
		| "created"
		| "updated"
		| "deleted"
		| "enabled"
		| "disabled"
		| "rule_added"
		| "rule_updated"
		| "rule_deleted"
	old_value: Record<string, any> | null
	new_value: Record<string, any> | null
	metadata: Record<string, any>
	created_at: string
}

/**
 * Context for flag evaluation
 */
export interface EvaluationContext {
	userId?: string
	userRole?: string
	organizationId?: string
	environment?: string
	customAttributes?: Record<string, any>
}

/**
 * Result of flag evaluation
 */
export interface EvaluationResult {
	enabled: boolean
	flagKey: string
	organizationId: string
	cached: boolean
	evaluatedAt: string
	error?: string
}

/**
 * Input for creating a flag
 */
export interface CreateFlagInput {
	key: string
	name: string
	description?: string
	enabled?: boolean
	org_id: string
	metadata?: Record<string, any>
}

/**
 * Input for updating a flag
 */
export interface UpdateFlagInput {
	name?: string
	description?: string
	enabled?: boolean
	metadata?: Record<string, any>
}

/**
 * Feature Flag Service
 * Handles flag evaluation, CRUD operations, and audit logging
 */
export class FeatureFlagService {
	private client: SupabaseClient

	constructor(client: SupabaseClient) {
		this.client = client
	}

	/**
	 * Evaluate a feature flag for a given context
	 * Uses caching for performance (<10ms requirement)
	 */
	async evaluateFlag(
		flagKey: string,
		organizationId: string,
		context: EvaluationContext = {},
	): Promise<EvaluationResult> {
		// Generate cache key
		const cacheKey = this.generateCacheKey(flagKey, organizationId, context)

		// Try cache first
		const cached = documentCache.get<boolean>(cacheKey)
		if (cached !== null) {
			return {
				enabled: cached,
				flagKey,
				organizationId,
				cached: true,
				evaluatedAt: new Date().toISOString(),
			}
		}

		// Evaluate using database function
		const { data, error } = await this.client.rpc("evaluate_flag_for_user", {
			p_flag_key: flagKey,
			p_org_id: organizationId,
			p_user_id: context.userId || null,
			p_context: context.customAttributes || {},
		})

		if (error) {
			console.error(`Error evaluating flag ${flagKey}:`, error)
			// Return false on error (safe default) with error field for callers to detect
			return {
				enabled: false,
				flagKey,
				organizationId,
				cached: false,
				evaluatedAt: new Date().toISOString(),
				error: error.message,
			}
		}

		const enabled = typeof data === "boolean" ? data : false

		// Cache the result
		documentCache.set(cacheKey, enabled)

		return {
			enabled,
			flagKey,
			organizationId,
			cached: false,
			evaluatedAt: new Date().toISOString(),
		}
	}

	/**
	 * Get all flags for an organization
	 */
	async getAllFlags(organizationId: string): Promise<FeatureFlag[]> {
		const cacheKey = `flags:org:${organizationId}`

		// Try cache first
		const cached = documentCache.get<FeatureFlag[]>(cacheKey)
		if (cached !== null) {
			return cached
		}

		const { data, error } = await this.client
			.from("feature_flags")
			.select("*")
			.eq("org_id", organizationId)
			.order("created_at", { ascending: false })

		if (error) throw error

		// Cache the result
		documentCache.set(cacheKey, data || [])

		return data || []
	}

	/**
	 * Get a single flag by ID
	 */
	async getFlag(flagId: string): Promise<FeatureFlag | null> {
		const cacheKey = `flag:${flagId}`

		// Try cache first
		const cached = documentCache.get<FeatureFlag>(cacheKey)
		if (cached !== null) {
			return cached
		}

		const { data, error } = await this.client
			.from("feature_flags")
			.select("*")
			.eq("id", flagId)
			.single()

		if (error) {
			if (error.code === "PGRST116") {
				// Not found
				return null
			}
			throw error
		}

		// Cache the result
		documentCache.set(cacheKey, data)

		return data
	}

	/**
	 * Get a flag by key and organization
	 */
	async getFlagByKey(
		flagKey: string,
		organizationId: string,
	): Promise<FeatureFlag | null> {
		const cacheKey = `flag:key:${organizationId}:${flagKey}`

		// Try cache first
		const cached = documentCache.get<FeatureFlag>(cacheKey)
		if (cached !== null) {
			return cached
		}

		const { data, error } = await this.client
			.from("feature_flags")
			.select("*")
			.eq("key", flagKey)
			.eq("org_id", organizationId)
			.single()

		if (error) {
			if (error.code === "PGRST116") {
				// Not found
				return null
			}
			throw error
		}

		// Cache the result
		documentCache.set(cacheKey, data)

		return data
	}

	/**
	 * Create a new feature flag
	 */
	async createFlag(input: CreateFlagInput): Promise<FeatureFlag> {
		const { data, error } = await this.client
			.from("feature_flags")
			.insert({
				key: input.key,
				name: input.name,
				description: input.description || null,
				enabled: input.enabled ?? false,
				org_id: input.org_id,
				metadata: input.metadata || {},
			})
			.select()
			.single()

		if (error) throw error

		// Invalidate cache
		this.invalidateFlagCache(input.org_id)

		return data
	}

	/**
	 * Update a feature flag
	 */
	async updateFlag(
		flagId: string,
		input: UpdateFlagInput,
	): Promise<FeatureFlag> {
		// Get the flag first to get org_id for cache invalidation
		const existingFlag = await this.getFlag(flagId)
		if (!existingFlag) {
			throw new Error("Flag not found")
		}

		const updateData: Record<string, any> = {
			updated_at: new Date().toISOString(),
		}
		if (input.name !== undefined) updateData.name = input.name
		if (input.description !== undefined)
			updateData.description = input.description
		if (input.enabled !== undefined) updateData.enabled = input.enabled
		if (input.metadata !== undefined) updateData.metadata = input.metadata

		const { data, error } = await this.client
			.from("feature_flags")
			.update(updateData)
			.eq("id", flagId)
			.select()
			.single()

		if (error) throw error

		// Invalidate cache
		this.invalidateFlagCache(existingFlag.org_id, flagId, existingFlag.key)

		return data
	}

	/**
	 * Delete a feature flag
	 */
	async deleteFlag(flagId: string): Promise<void> {
		// Get the flag first to get org_id for cache invalidation
		const existingFlag = await this.getFlag(flagId)
		if (!existingFlag) {
			throw new Error("Flag not found")
		}

		const { error } = await this.client
			.from("feature_flags")
			.delete()
			.eq("id", flagId)

		if (error) throw error

		// Invalidate cache
		this.invalidateFlagCache(existingFlag.org_id, flagId, existingFlag.key)
	}

	/**
	 * Get rules for a flag
	 */
	async getFlagRules(flagId: string): Promise<FlagRule[]> {
		const cacheKey = `flag:rules:${flagId}`

		// Try cache first
		const cached = documentCache.get<FlagRule[]>(cacheKey)
		if (cached !== null) {
			return cached
		}

		const { data, error } = await this.client
			.from("flag_rules")
			.select("*")
			.eq("flag_id", flagId)
			.order("priority", { ascending: false })

		if (error) throw error

		// Cache the result
		documentCache.set(cacheKey, data || [])

		return data || []
	}

	/**
	 * Get audit logs for a flag
	 */
	async getFlagAuditLogs(
		flagId: string,
		limit = 50,
	): Promise<FlagAuditLog[]> {
		const { data, error } = await this.client
			.from("flag_audit_logs")
			.select("*")
			.eq("flag_id", flagId)
			.order("created_at", { ascending: false })
			.limit(limit)

		if (error) throw error

		return data || []
	}

	/**
	 * Generate cache key for flag evaluation
	 */
	private generateCacheKey(
		flagKey: string,
		organizationId: string,
		context: EvaluationContext,
	): string {
		const contextParts: string[] = [
			`flag:eval:${organizationId}:${flagKey}`,
		]

		if (context.userId) contextParts.push(`user:${context.userId}`)
		if (context.userRole) contextParts.push(`role:${context.userRole}`)
		if (context.environment) contextParts.push(`env:${context.environment}`)

		// Include custom attributes in cache key (use JSON for complex values)
		if (context.customAttributes) {
			const sortedAttrs = Object.keys(context.customAttributes)
				.sort()
				.reduce(
					(acc, key) => {
						acc[key] = context.customAttributes![key]
						return acc
					},
					{} as Record<string, any>,
				)
			contextParts.push(`attrs:${JSON.stringify(sortedAttrs)}`)
		}

		return contextParts.join(":")
	}

	/**
	 * Invalidate cache for a flag
	 */
	private invalidateFlagCache(
		organizationId: string,
		flagId?: string,
		flagKey?: string,
	): void {
		// Invalidate organization flags list
		documentCache.delete(`flags:org:${organizationId}`)

		// Invalidate specific flag cache
		if (flagId) {
			documentCache.delete(`flag:${flagId}`)
			documentCache.delete(`flag:rules:${flagId}`)
		}

		// Invalidate flag by key cache
		if (flagKey) {
			documentCache.delete(`flag:key:${organizationId}:${flagKey}`)
		}

		// Note: We don't invalidate evaluation caches here because they have TTL
		// and will expire naturally. This prevents performance issues from
		// over-aggressive cache invalidation on frequent flag updates.
	}
}

// Export singleton instance using admin client for backward compatibility
// Specific routes can create their own instances with user-scoped clients
import { supabaseAdmin } from "../supabase"
export const featureFlagService = new FeatureFlagService(supabaseAdmin)
