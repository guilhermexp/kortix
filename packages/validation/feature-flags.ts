import { z } from "zod"
import "zod-openapi"

/**
 * Feature Flag Validation Schemas
 * Zod schemas for feature flag management and evaluation
 */

// Enums
export const FlagRuleTypeEnum = z.enum([
	"user_segment",
	"percentage",
	"custom",
	"user_id",
	"environment",
])
export type FlagRuleType = z.infer<typeof FlagRuleTypeEnum>

export const FlagAuditActionEnum = z.enum([
	"created",
	"updated",
	"deleted",
	"enabled",
	"disabled",
	"rule_added",
	"rule_updated",
	"rule_deleted",
])
export type FlagAuditAction = z.infer<typeof FlagAuditActionEnum>

// Example data for documentation
const exampleMetadata = {
	environment: "production",
	team: "growth",
	jiraTicket: "PROD-123",
} as const

const exampleConditions = {
	userRole: "admin",
	tier: "premium",
} as const

const exampleCustomAttributes = {
	country: "US",
	plan: "enterprise",
	experimentGroup: "A",
} as const

// Core Schemas

/**
 * Evaluation context for flag evaluation
 */
export const EvaluationContextSchema = z
	.object({
		userId: z.string().optional().meta({
			description: "Optional user ID for user-specific flag evaluation",
			example: "user_abc123",
		}),
		userRole: z.string().optional().meta({
			description: "Optional user role for role-based targeting",
			example: "admin",
		}),
		organizationId: z.string().optional().meta({
			description: "Optional organization ID for organization-scoped flags",
			example: "org_xyz789",
		}),
		environment: z.string().optional().meta({
			description: "Optional environment identifier (dev, staging, production)",
			example: "production",
		}),
		customAttributes: z.record(z.string(), z.any()).optional().meta({
			description:
				"Optional custom attributes for advanced targeting and segmentation",
			example: exampleCustomAttributes,
		}),
	})
	.meta({
		description:
			"Context information for evaluating feature flags, including user, role, and custom attributes",
		example: {
			userId: "user_abc123",
			userRole: "admin",
			organizationId: "org_xyz789",
			environment: "production",
			customAttributes: exampleCustomAttributes,
		},
	})
export type EvaluationContext = z.infer<typeof EvaluationContextSchema>

/**
 * Flag rule for targeting and rollouts
 */
export const FlagRuleSchema = z
	.object({
		id: z.string().meta({
			description: "Unique identifier for the rule",
			example: "rule_abc123",
		}),
		flag_id: z.string().meta({
			description: "ID of the feature flag this rule belongs to",
			example: "flag_xyz789",
		}),
		type: FlagRuleTypeEnum.meta({
			description:
				"Type of rule: user_segment (target user groups), percentage (gradual rollout), custom (complex logic), user_id (specific users), environment (dev/staging/prod)",
			example: "percentage",
		}),
		conditions: z.record(z.string(), z.any()).meta({
			description:
				'Rule conditions in JSON format (e.g., {"userRole": "admin"}, {"userId": ["user1", "user2"]})',
			example: exampleConditions,
		}),
		rollout_percentage: z.number().min(0).max(100).nullable().optional().meta({
			description:
				"Percentage of users to include (0-100) for percentage-based rollouts",
			example: 25,
		}),
		priority: z.number().meta({
			description: "Rule evaluation priority (higher numbers evaluated first)",
			example: 100,
		}),
		enabled: z.boolean().meta({
			description: "Whether this rule is currently active",
			example: true,
		}),
		created_at: z.string().meta({
			description: "Creation timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
		updated_at: z.string().meta({
			description: "Last update timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
	})
	.meta({
		description: "Rule for targeting specific users or implementing gradual rollouts",
		example: {
			id: "rule_abc123",
			flag_id: "flag_xyz789",
			type: "percentage",
			conditions: {},
			rollout_percentage: 25,
			priority: 100,
			enabled: true,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	})
export type FlagRule = z.infer<typeof FlagRuleSchema>

/**
 * Feature flag
 */
export const FeatureFlagSchema = z
	.object({
		id: z.string().meta({
			description: "Unique identifier for the feature flag",
			example: "flag_abc123",
		}),
		key: z.string().meta({
			description:
				'Unique key for the flag (e.g., "new_dashboard", "ai_features")',
			example: "new_dashboard",
		}),
		name: z.string().meta({
			description: "Human-readable name for the flag",
			example: "New Dashboard",
		}),
		description: z.string().nullable().optional().meta({
			description: "Explanation of what this flag controls",
			example: "Enables the redesigned dashboard with improved analytics",
		}),
		enabled: z.boolean().meta({
			description: "Whether the flag is currently active",
			example: true,
		}),
		org_id: z.string().meta({
			description: "Organization ID this flag belongs to",
			example: "org_xyz789",
		}),
		metadata: z.record(z.string(), z.any()).meta({
			description:
				"Additional flag configuration (environments, tags, team ownership, etc)",
			example: exampleMetadata,
		}),
		created_at: z.string().meta({
			description: "Creation timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
		updated_at: z.string().meta({
			description: "Last update timestamp",
			example: new Date().toISOString(),
			format: "date-time",
		}),
	})
	.meta({
		description:
			"Feature flag for controlled rollouts, A/B testing, and user-specific feature access",
		example: {
			id: "flag_abc123",
			key: "new_dashboard",
			name: "New Dashboard",
			description: "Enables the redesigned dashboard with improved analytics",
			enabled: true,
			org_id: "org_xyz789",
			metadata: exampleMetadata,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	})
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>

/**
 * Create flag input schema
 */
export const CreateFlagSchema = z
	.object({
		key: z
			.string()
			.min(1)
			.max(255)
			.regex(/^[a-z0-9_-]+$/)
			.meta({
				description:
					'Unique key for the flag (lowercase letters, numbers, underscores, hyphens only, e.g., "new_dashboard")',
				example: "new_dashboard",
			}),
		name: z.string().min(1).max(255).meta({
			description: "Human-readable name for the flag",
			example: "New Dashboard",
		}),
		description: z.string().optional().meta({
			description: "Explanation of what this flag controls",
			example: "Enables the redesigned dashboard with improved analytics",
		}),
		enabled: z.boolean().default(false).meta({
			description: "Whether the flag should be enabled on creation (default: false)",
			example: false,
		}),
		org_id: z.string().uuid().meta({
			description: "Organization ID this flag belongs to",
			example: "org_xyz789",
		}),
		metadata: z.record(z.string(), z.any()).optional().meta({
			description: "Additional flag configuration (environments, tags, etc)",
			example: exampleMetadata,
		}),
	})
	.meta({
		description: "Input schema for creating a new feature flag",
		example: {
			key: "new_dashboard",
			name: "New Dashboard",
			description: "Enables the redesigned dashboard with improved analytics",
			enabled: false,
			org_id: "org_xyz789",
			metadata: exampleMetadata,
		},
	})
export type CreateFlagInput = z.infer<typeof CreateFlagSchema>

/**
 * Update flag input schema
 */
export const UpdateFlagSchema = z
	.object({
		name: z.string().min(1).max(255).optional().meta({
			description: "Human-readable name for the flag",
			example: "New Dashboard v2",
		}),
		description: z.string().optional().meta({
			description: "Explanation of what this flag controls",
			example: "Enables the redesigned dashboard with improved analytics and AI",
		}),
		enabled: z.boolean().optional().meta({
			description: "Whether the flag is currently active",
			example: true,
		}),
		metadata: z.record(z.string(), z.any()).optional().meta({
			description: "Additional flag configuration (environments, tags, etc)",
			example: exampleMetadata,
		}),
	})
	.meta({
		description: "Input schema for updating an existing feature flag",
		example: {
			name: "New Dashboard v2",
			description: "Enables the redesigned dashboard with improved analytics and AI",
			enabled: true,
			metadata: exampleMetadata,
		},
	})
export type UpdateFlagInput = z.infer<typeof UpdateFlagSchema>

/**
 * Create flag rule input schema
 */
export const CreateFlagRuleSchema = z
	.object({
		flag_id: z.string().uuid().meta({
			description: "ID of the feature flag this rule belongs to",
			example: "flag_xyz789",
		}),
		type: FlagRuleTypeEnum.meta({
			description:
				"Type of rule: user_segment, percentage, custom, user_id, or environment",
			example: "percentage",
		}),
		conditions: z.record(z.string(), z.any()).default({}).meta({
			description:
				'Rule conditions in JSON format (e.g., {"userRole": "admin"})',
			example: exampleConditions,
		}),
		rollout_percentage: z
			.number()
			.min(0)
			.max(100)
			.nullable()
			.optional()
			.meta({
				description: "Percentage of users to include (0-100) for percentage rollouts",
				example: 25,
			}),
		priority: z.number().default(0).meta({
			description: "Rule evaluation priority (higher numbers evaluated first)",
			example: 100,
		}),
		enabled: z.boolean().default(true).meta({
			description: "Whether this rule is currently active",
			example: true,
		}),
	})
	.meta({
		description: "Input schema for creating a new flag rule",
		example: {
			flag_id: "flag_xyz789",
			type: "percentage",
			conditions: {},
			rollout_percentage: 25,
			priority: 100,
			enabled: true,
		},
	})
export type CreateFlagRuleInput = z.infer<typeof CreateFlagRuleSchema>

/**
 * Update flag rule input schema
 */
export const UpdateFlagRuleSchema = z
	.object({
		type: FlagRuleTypeEnum.optional().meta({
			description:
				"Type of rule: user_segment, percentage, custom, user_id, or environment",
			example: "percentage",
		}),
		conditions: z.record(z.string(), z.any()).optional().meta({
			description:
				'Rule conditions in JSON format (e.g., {"userRole": "admin"})',
			example: exampleConditions,
		}),
		rollout_percentage: z
			.number()
			.min(0)
			.max(100)
			.nullable()
			.optional()
			.meta({
				description: "Percentage of users to include (0-100) for percentage rollouts",
				example: 50,
			}),
		priority: z.number().optional().meta({
			description: "Rule evaluation priority (higher numbers evaluated first)",
			example: 200,
		}),
		enabled: z.boolean().optional().meta({
			description: "Whether this rule is currently active",
			example: false,
		}),
	})
	.meta({
		description: "Input schema for updating an existing flag rule",
		example: {
			rollout_percentage: 50,
			priority: 200,
		},
	})
export type UpdateFlagRuleInput = z.infer<typeof UpdateFlagRuleSchema>

/**
 * Flag audit log entry
 */
export const FlagAuditLogSchema = z
	.object({
		id: z.string().meta({
			description: "Unique identifier for the audit log entry",
			example: "log_abc123",
		}),
		flag_id: z.string().meta({
			description: "ID of the feature flag that was modified",
			example: "flag_xyz789",
		}),
		user_id: z.string().nullable().optional().meta({
			description: "User who made the change (NULL for system changes)",
			example: "user_abc123",
		}),
		action: FlagAuditActionEnum.meta({
			description:
				"Type of change: created, updated, deleted, enabled, disabled, rule_added, rule_updated, rule_deleted",
			example: "enabled",
		}),
		old_value: z.record(z.string(), z.any()).nullable().optional().meta({
			description: "Previous state of the flag or rule before the change",
			example: { enabled: false },
		}),
		new_value: z.record(z.string(), z.any()).nullable().optional().meta({
			description: "New state of the flag or rule after the change",
			example: { enabled: true },
		}),
		metadata: z.record(z.string(), z.any()).meta({
			description: "Additional metadata about the change",
			example: { ip_address: "192.168.1.1", user_agent: "Mozilla/5.0" },
		}),
		created_at: z.string().meta({
			description: "Timestamp when the change occurred",
			example: new Date().toISOString(),
			format: "date-time",
		}),
	})
	.meta({
		description:
			"Audit log entry tracking changes to feature flags for compliance and debugging",
		example: {
			id: "log_abc123",
			flag_id: "flag_xyz789",
			user_id: "user_abc123",
			action: "enabled",
			old_value: { enabled: false },
			new_value: { enabled: true },
			metadata: { ip_address: "192.168.1.1" },
			created_at: new Date().toISOString(),
		},
	})
export type FlagAuditLog = z.infer<typeof FlagAuditLogSchema>

/**
 * Evaluation result
 */
export const EvaluationResultSchema = z
	.object({
		enabled: z.boolean().meta({
			description: "Whether the flag is enabled for this context",
			example: true,
		}),
		flagKey: z.string().meta({
			description: "The key of the evaluated flag",
			example: "new_dashboard",
		}),
		organizationId: z.string().meta({
			description: "Organization ID for which the flag was evaluated",
			example: "org_xyz789",
		}),
		cached: z.boolean().meta({
			description: "Whether this result came from cache",
			example: true,
		}),
		evaluatedAt: z.string().meta({
			description: "Timestamp when the flag was evaluated",
			example: new Date().toISOString(),
			format: "date-time",
		}),
	})
	.meta({
		description: "Result of evaluating a feature flag for a specific context",
		example: {
			enabled: true,
			flagKey: "new_dashboard",
			organizationId: "org_xyz789",
			cached: true,
			evaluatedAt: new Date().toISOString(),
		},
	})
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>

/**
 * Evaluate flag request body
 */
export const EvaluateFlagRequestSchema = z
	.object({
		flagKey: z.string().min(1).meta({
			description: "Key of the flag to evaluate",
			example: "new_dashboard",
		}),
		organizationId: z.string().uuid().meta({
			description: "Organization ID for evaluation",
			example: "org_xyz789",
		}),
		context: EvaluationContextSchema.optional().meta({
			description: "Optional evaluation context",
		}),
	})
	.meta({
		description: "Request body for evaluating a feature flag",
		example: {
			flagKey: "new_dashboard",
			organizationId: "org_xyz789",
			context: {
				userId: "user_abc123",
				userRole: "admin",
			},
		},
	})
export type EvaluateFlagRequest = z.infer<typeof EvaluateFlagRequestSchema>
