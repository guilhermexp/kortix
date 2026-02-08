/**
 * Feature Flags Route Handlers
 * Handles feature flag CRUD operations, evaluation, and audit logs
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
	CreateFlagSchema,
	EvaluateFlagRequestSchema,
	UpdateFlagSchema,
	type CreateFlagInput,
	type EvaluationContext,
	type UpdateFlagInput,
} from "@repo/validation/feature-flags"
import { FeatureFlagService } from "../services/feature-flags"

/**
 * List all feature flags for an organization
 */
export async function listFlags(
	client: SupabaseClient,
	organizationId: string,
) {
	const service = new FeatureFlagService(client)
	const flags = await service.getAllFlags(organizationId)

	return {
		flags,
	}
}

/**
 * Get a single feature flag by ID
 */
export async function getFlag(
	client: SupabaseClient,
	organizationId: string,
	flagId: string,
) {
	const service = new FeatureFlagService(client)
	const flag = await service.getFlag(flagId)

	if (!flag) {
		throw new Error("Flag not found")
	}

	// Security: Verify flag belongs to the organization
	if (flag.org_id !== organizationId) {
		throw new Error("Flag not found")
	}

	return {
		flag,
	}
}

/**
 * Create a new feature flag
 */
export async function createFlag(
	client: SupabaseClient,
	organizationId: string,
	body: unknown,
) {
	const payload = CreateFlagSchema.parse(body)

	// Security: Ensure org_id matches session organization
	if (payload.org_id !== organizationId) {
		throw new Error("Organization ID mismatch")
	}

	const service = new FeatureFlagService(client)
	const flag = await service.createFlag(payload)

	return {
		message: "Flag created",
		flag,
	}
}

/**
 * Update a feature flag
 */
export async function updateFlag(
	client: SupabaseClient,
	organizationId: string,
	flagId: string,
	body: unknown,
) {
	const payload = UpdateFlagSchema.parse(body ?? {})

	const service = new FeatureFlagService(client)

	// Security: Verify flag belongs to the organization before updating
	const existingFlag = await service.getFlag(flagId)
	if (!existingFlag) {
		throw new Error("Flag not found")
	}
	if (existingFlag.org_id !== organizationId) {
		throw new Error("Flag not found")
	}

	const flag = await service.updateFlag(flagId, payload)

	return {
		message: "Flag updated",
		flag,
	}
}

/**
 * Delete a feature flag
 */
export async function deleteFlag(
	client: SupabaseClient,
	organizationId: string,
	flagId: string,
) {
	const service = new FeatureFlagService(client)

	// Security: Verify flag belongs to the organization before deleting
	const existingFlag = await service.getFlag(flagId)
	if (!existingFlag) {
		throw new Error("Flag not found")
	}
	if (existingFlag.org_id !== organizationId) {
		throw new Error("Flag not found")
	}

	await service.deleteFlag(flagId)

	return {
		message: "Flag deleted",
	}
}

/**
 * Evaluate a feature flag for a given context
 */
export async function evaluateFlag(
	client: SupabaseClient,
	organizationId: string,
	body: unknown,
) {
	const payload = EvaluateFlagRequestSchema.parse(body)

	// Security: Ensure organization ID matches session
	if (payload.organizationId !== organizationId) {
		throw new Error("Organization ID mismatch")
	}

	const service = new FeatureFlagService(client)
	const result = await service.evaluateFlag(
		payload.flagKey,
		payload.organizationId,
		payload.context ?? {},
	)

	return result
}

/**
 * Get audit logs for a feature flag
 */
export async function getFlagAuditLog(
	client: SupabaseClient,
	organizationId: string,
	flagId: string,
	limit?: number,
) {
	const service = new FeatureFlagService(client)

	// Security: Verify flag belongs to the organization
	const existingFlag = await service.getFlag(flagId)
	if (!existingFlag) {
		throw new Error("Flag not found")
	}
	if (existingFlag.org_id !== organizationId) {
		throw new Error("Flag not found")
	}

	const logs = await service.getFlagAuditLogs(flagId, limit ?? 50)

	return {
		logs,
	}
}
