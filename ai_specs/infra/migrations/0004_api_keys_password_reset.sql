-- API keys for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    name            text NOT NULL,
    prefix          text,
    secret_hash     text NOT NULL,
    token_hint      text NOT NULL,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_used_at    timestamptz,
    expires_at      timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys (org_id);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS api_keys_revoked_idx ON api_keys (revoked_at);

DROP TRIGGER IF EXISTS set_timestamp_api_keys ON api_keys;
CREATE TRIGGER set_timestamp_api_keys
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_select_authenticated
ON api_keys
FOR SELECT
TO authenticated
USING (org_id = public.current_request_org());

CREATE POLICY api_keys_insert_authenticated
ON api_keys
FOR INSERT
TO authenticated
WITH CHECK (
    org_id = public.current_request_org() AND
    (public.current_request_user() IS NULL OR user_id = public.current_request_user())
);

CREATE POLICY api_keys_update_authenticated
ON api_keys
FOR UPDATE
TO authenticated
USING (org_id = public.current_request_org())
WITH CHECK (org_id = public.current_request_org());

CREATE POLICY api_keys_delete_authenticated
ON api_keys
FOR DELETE
TO authenticated
USING (org_id = public.current_request_org());

CREATE POLICY api_keys_service_role_all
ON api_keys
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      text NOT NULL UNIQUE,
    requested_from  inet,
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);
CREATE INDEX IF NOT EXISTS password_resets_org_idx ON password_resets (org_id);
CREATE INDEX IF NOT EXISTS password_resets_expiry_idx ON password_resets (expires_at);

ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;

CREATE POLICY password_resets_service_role_all
ON password_resets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Legacy table cleanup after removing OTP flow
DROP TABLE IF EXISTS auth_verifications;
