-- ================================================
-- Fix feature flags issues found during code review
-- Migration: 0020_fix_feature_flags_issues
-- ================================================

-- Fix 1: Percentage rollout bug due to negative hash values
-- bit(32)::bigint can produce negative values, and PostgreSQL's modulo preserves the sign.
-- This caused ~50% of users to be excluded from percentage-based rollouts.
-- Also adds missing 'environment' rule type handling.

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
            v_rollout_bucket := ABS(v_user_hash % 100);

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

        -- Environment targeting
        IF v_rule.type = 'environment' THEN
            IF v_rule.conditions ? 'environment' THEN
                IF v_rule.conditions->>'environment' = p_context->>'environment' THEN
                    RETURN true;
                END IF;
            END IF;
        END IF;

        -- Custom context matching
        IF v_rule.type = 'custom' THEN
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

-- Fix 2: Preserve audit logs when a feature flag is deleted
-- Change ON DELETE CASCADE to ON DELETE SET NULL and add flag_key column
ALTER TABLE flag_audit_logs
    ALTER COLUMN flag_id DROP NOT NULL;

ALTER TABLE flag_audit_logs
    DROP CONSTRAINT IF EXISTS flag_audit_logs_flag_id_fkey;

ALTER TABLE flag_audit_logs
    ADD CONSTRAINT flag_audit_logs_flag_id_fkey
    FOREIGN KEY (flag_id) REFERENCES feature_flags(id) ON DELETE SET NULL;

ALTER TABLE flag_audit_logs
    ADD COLUMN IF NOT EXISTS flag_key TEXT;

COMMENT ON COLUMN flag_audit_logs.flag_key IS 'Flag key preserved for audit trail when flag is deleted';
