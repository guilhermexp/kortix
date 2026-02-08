-- ================================================
-- Add feature flags system for controlled rollouts and A/B testing
-- Migration: 0019_create_feature_flags_tables
-- ================================================

-- Feature flags table for managing feature toggles and controlled rollouts
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT false NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups by organization
CREATE INDEX IF NOT EXISTS idx_feature_flags_org
    ON feature_flags(org_id);

-- Create index for fast lookups by key
CREATE INDEX IF NOT EXISTS idx_feature_flags_key
    ON feature_flags(key);

-- Create index for enabled flags
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled
    ON feature_flags(enabled) WHERE enabled = true;

-- Create composite index for org and enabled status
CREATE INDEX IF NOT EXISTS idx_feature_flags_org_enabled
    ON feature_flags(org_id, enabled);

-- Comments for documentation
COMMENT ON TABLE feature_flags IS 'Feature flags for controlled rollouts, A/B testing, and user-specific feature access';
COMMENT ON COLUMN feature_flags.key IS 'Unique identifier for the flag (e.g., "new_dashboard", "ai_features")';
COMMENT ON COLUMN feature_flags.name IS 'Human-readable name for the flag';
COMMENT ON COLUMN feature_flags.description IS 'Explanation of what this flag controls';
COMMENT ON COLUMN feature_flags.enabled IS 'Whether the flag is currently active';
COMMENT ON COLUMN feature_flags.metadata IS 'Additional flag configuration (environments, tags, etc)';

-- ================================================
-- Flag rules table for targeting and rollout strategies
-- ================================================

CREATE TABLE IF NOT EXISTS flag_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id UUID REFERENCES feature_flags(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('user_segment', 'percentage', 'custom', 'user_id', 'environment')),
    conditions JSONB DEFAULT '{}'::jsonb NOT NULL,
    rollout_percentage NUMERIC(5,2) CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    priority INTEGER DEFAULT 0 NOT NULL,
    enabled BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups by flag
CREATE INDEX IF NOT EXISTS idx_flag_rules_flag
    ON flag_rules(flag_id);

-- Create index for rule type
CREATE INDEX IF NOT EXISTS idx_flag_rules_type
    ON flag_rules(type);

-- Create composite index for enabled rules by flag
CREATE INDEX IF NOT EXISTS idx_flag_rules_flag_enabled
    ON flag_rules(flag_id, enabled, priority DESC) WHERE enabled = true;

-- Comments for documentation
COMMENT ON TABLE flag_rules IS 'Rules for targeting specific users or implementing gradual rollouts';
COMMENT ON COLUMN flag_rules.flag_id IS 'The feature flag this rule applies to';
COMMENT ON COLUMN flag_rules.type IS 'Type of rule: user_segment (target user groups), percentage (gradual rollout), custom (complex logic), user_id (specific users), environment (dev/staging/prod)';
COMMENT ON COLUMN flag_rules.conditions IS 'Rule conditions in JSON format (e.g., {"userRole": "admin"}, {"userId": ["user1", "user2"]})';
COMMENT ON COLUMN flag_rules.rollout_percentage IS 'Percentage of users to include (0-100) for percentage-based rollouts';
COMMENT ON COLUMN flag_rules.priority IS 'Rule evaluation priority (higher numbers evaluated first)';

-- ================================================
-- Flag audit logs table for tracking all flag changes
-- ================================================

CREATE TABLE IF NOT EXISTS flag_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id UUID REFERENCES feature_flags(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'enabled', 'disabled', 'rule_added', 'rule_updated', 'rule_deleted')),
    old_value JSONB,
    new_value JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups by flag
CREATE INDEX IF NOT EXISTS idx_flag_audit_logs_flag
    ON flag_audit_logs(flag_id);

-- Create index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_flag_audit_logs_user
    ON flag_audit_logs(user_id);

-- Create index for recent audit logs (most common query)
CREATE INDEX IF NOT EXISTS idx_flag_audit_logs_created
    ON flag_audit_logs(created_at DESC);

-- Create composite index for flag audit history
CREATE INDEX IF NOT EXISTS idx_flag_audit_logs_flag_created
    ON flag_audit_logs(flag_id, created_at DESC);

-- Comments for documentation
COMMENT ON TABLE flag_audit_logs IS 'Audit trail of all feature flag changes for compliance and debugging';
COMMENT ON COLUMN flag_audit_logs.flag_id IS 'The feature flag that was modified';
COMMENT ON COLUMN flag_audit_logs.user_id IS 'User who made the change (NULL for system changes)';
COMMENT ON COLUMN flag_audit_logs.action IS 'Type of change: created, updated, deleted, enabled, disabled, rule_added, rule_updated, rule_deleted';
COMMENT ON COLUMN flag_audit_logs.old_value IS 'Previous state of the flag or rule before the change';
COMMENT ON COLUMN flag_audit_logs.new_value IS 'New state of the flag or rule after the change';

-- ================================================
-- Helper function: evaluate_flag_for_user
-- Evaluates whether a feature flag is enabled for a specific user
-- ================================================

CREATE OR REPLACE FUNCTION evaluate_flag_for_user(
    p_flag_key TEXT,
    p_org_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
DECLARE
    v_flag_id UUID;
    v_flag_enabled BOOLEAN;
    v_rule RECORD;
    v_user_hash NUMERIC;
    v_rollout_bucket NUMERIC;
BEGIN
    -- Get the flag
    SELECT id, enabled
    INTO v_flag_id, v_flag_enabled
    FROM feature_flags
    WHERE key = p_flag_key AND org_id = p_org_id;

    -- Return false if flag doesn't exist or is disabled
    IF v_flag_id IS NULL OR v_flag_enabled = false THEN
        RETURN false;
    END IF;

    -- If no rules exist, return the flag's enabled status
    IF NOT EXISTS (SELECT 1 FROM flag_rules WHERE flag_id = v_flag_id AND enabled = true) THEN
        RETURN v_flag_enabled;
    END IF;

    -- Evaluate rules in priority order
    FOR v_rule IN
        SELECT type, conditions, rollout_percentage
        FROM flag_rules
        WHERE flag_id = v_flag_id AND enabled = true
        ORDER BY priority DESC
    LOOP
        -- Percentage-based rollout
        IF v_rule.type = 'percentage' AND p_user_id IS NOT NULL THEN
            -- Create a consistent hash of user_id + flag_id for stable rollout
            v_user_hash := (('x' || substr(md5(p_user_id::text || v_flag_id::text), 1, 8))::bit(32)::bigint);
            v_rollout_bucket := (v_user_hash % 100);

            IF v_rollout_bucket < v_rule.rollout_percentage THEN
                RETURN true;
            END IF;
        END IF;

        -- User ID targeting
        IF v_rule.type = 'user_id' AND p_user_id IS NOT NULL THEN
            IF v_rule.conditions ? 'userIds' THEN
                IF v_rule.conditions->'userIds' @> to_jsonb(p_user_id::text) THEN
                    RETURN true;
                END IF;
            END IF;
        END IF;

        -- Custom context matching
        IF v_rule.type = 'custom' THEN
            -- Check if all conditions in the rule match the provided context
            IF v_rule.conditions <@ p_context THEN
                RETURN true;
            END IF;
        END IF;
    END LOOP;

    -- No rules matched, return false
    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION evaluate_flag_for_user IS 'Evaluates whether a feature flag is enabled for a specific user based on flag rules and user context';

-- ================================================
-- Helper function: get_flags_for_organization
-- Returns all flags for an organization with their current enabled status
-- ================================================

CREATE OR REPLACE FUNCTION get_flags_for_organization(
    p_org_id UUID
)
RETURNS TABLE (
    flag_id UUID,
    flag_key TEXT,
    flag_name TEXT,
    flag_description TEXT,
    enabled BOOLEAN,
    rules_count BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id AS flag_id,
        f.key AS flag_key,
        f.name AS flag_name,
        f.description AS flag_description,
        f.enabled,
        COUNT(r.id) AS rules_count,
        f.created_at,
        f.updated_at
    FROM feature_flags f
    LEFT JOIN flag_rules r ON r.flag_id = f.id AND r.enabled = true
    WHERE f.org_id = p_org_id
    GROUP BY f.id, f.key, f.name, f.description, f.enabled, f.created_at, f.updated_at
    ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_flags_for_organization IS 'Returns all feature flags for an organization with their rule counts';
