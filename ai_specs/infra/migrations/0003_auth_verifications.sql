create table if not exists auth_verifications (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_verifications_identifier_idx on auth_verifications(identifier);
create index if not exists auth_verifications_expires_at_idx on auth_verifications(expires_at);
