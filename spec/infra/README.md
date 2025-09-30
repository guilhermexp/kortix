# Infrastructure Notes

## Supabase Project
- **URL**: `https://lrqjdzqyaoiovnzfbnrj.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNjcyNDksImV4cCI6MjA3NDc0MzI0OX0.QzcD8EzJgAxf2K4oM9oFSQ3p-YXeS0tWfX-8MnUmw0s`
- **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE2NzI0OSwiZXhwIjoyMDc0NzQzMjQ5fQ.cBCXvycwWSFD1G4BMRx4-f8gYzhWtPBEa4WQBGVXs1U`

> ⚠️ Trate o service-role como segredo. Armazene em cofre seguro (1Password, Doppler, Supabase Vault). Nunca exponha no cliente.

## Suggested Resources
- **Database schema**: use Drizzle migrations targeting Supabase Postgres (`postgresql://postgres:81883311varela0045@db.lrqjdzqyaoiovnzfbnrj.supabase.co:5432/postgres`).
- **Storage bucket**: criar `supermemory-uploads` para uploads brutos (caso necessário).
- **Workers**: processamento assíncrono roda hoje dentro do backend Bun; avaliar Supabase Queue conforme volume.

## Environment Variable Mapping
Adicione ao backend (`apps/api/.env.local` ou secret manager da sua hospedagem):

| Variable | Value/Notes |
| --- | --- |
| `SUPABASE_URL` | `https://lrqjdzqyaoiovnzfbnrj.supabase.co` |
| `SUPABASE_ANON_KEY` | Use when the frontend needs direct Supabase access (if ever). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only; used for migrations and background jobs. |
| `SUPABASE_DATABASE_URL` | Postgres connection string from Supabase settings (create long-lived password). |
| `SUPABASE_DATABASE_PASSWORD` | `81883311varela0045` (store securely) |
| `SUPABASE_DATABASE_URL` | `postgresql://postgres:81883311varela0045@db.lrqjdzqyaoiovnzfbnrj.supabase.co:5432/postgres` |
| `SUPABASE_STORAGE_BUCKET` | `supermemory-uploads` |
| `GEMINI_API_KEY` | `AIzaSyB7jGB1ja8QNws2M5kagwXLlQF69C3u1cY` |

Keep this file updated as new infrastructure pieces are provisioned (queues, buckets, connection strings).

## Auth & RLS Notes
- O backend resolve o cookie `sm_session`, identifica `organization_id` / `user_id` com a Supabase e injeta os headers `X-Supermemory-Organization` e `X-Supermemory-User` usados pelas funções `current_request_org()` / `current_request_user()` nas políticas RLS.
- A tabela `api_keys` usa RLS para permitir apenas acesso dentro da organização autenticada; `password_resets` permanece restrita ao `service_role`.
- A tabela legada `auth_verifications` foi removida porque os fluxos OTP/magic link não são mais necessários; tokens de redefinição ficam em `password_resets`.
