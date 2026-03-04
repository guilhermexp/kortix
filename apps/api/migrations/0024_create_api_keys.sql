-- Migration: Create api_keys table for MCP/API key authentication
-- Purpose: Persist hashed API keys scoped by organization and user.

-- Main table used by apps/api/src/routes/api-keys.ts and apps/api/src/routes/mcp.ts
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  prefix TEXT,
  secret_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash (64 hex chars)
  token_hint TEXT NOT NULL, -- Last 6 chars of the raw token (for display only)
  metadata JSONB DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common access patterns (auth lookup + ownership filtering)
CREATE INDEX IF NOT EXISTS idx_api_keys_secret_hash ON public.api_keys(secret_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON public.api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);

-- RLS keeps direct client access restricted to owner records.
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own api keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can create own api keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can update own api keys" ON public.api_keys;

CREATE POLICY "Users can view own api keys"
  ON public.api_keys FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own api keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own api keys"
  ON public.api_keys FOR UPDATE
  USING (user_id = auth.uid());
