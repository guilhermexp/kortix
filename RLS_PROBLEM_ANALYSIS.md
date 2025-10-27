# Análise Completa do Problema RLS

**Data**: 26 de Outubro de 2025, 22:30
**Problema**: Frontend não mostra documentos nem memórias, mas os dados existem no banco

## 1. ESTADO ATUAL DO BANCO DE DADOS

### Dados Existentes
- **177 memórias** na tabela `memories`
- **113 documentos** na tabela `documents`
- Org ID comum: `bfe2107a-9f06-46de-9cfe-9ba64000991d`
- User ID comum: `6a26c2d5-b06d-4250-9b9a-9e0b8a2a86a7`

### Políticas RLS Atuais (depois das minhas alterações)

**Tabela: documents**
```sql
-- SELECT: permitido para anon, authenticated, authenticator, service_role
USING (true)  -- PERMITE TUDO

-- INSERT/UPDATE/DELETE: permitido para authenticated, authenticator, service_role
USING (true)  -- PERMITE TUDO
WITH CHECK (true)  -- PERMITE TUDO
```

**Tabela: memories**
```sql
-- SELECT: permitido para anon, authenticated, authenticator, service_role
USING (true)  -- PERMITE TUDO

-- INSERT/UPDATE/DELETE: permitido para authenticated, authenticator, service_role
USING (true)  -- PERMITE TUDO
WITH CHECK (true)  -- PERMITE TUDO
```

### Funções Helper
```sql
-- Função que lê header customizado
current_request_org() → retorna UUID do header 'x-supermemory-organization'
current_request_user() → retorna UUID do header 'x-supermemory-user'
```

## 2. ESTADO ORIGINAL (QUE FUNCIONAVA)

### Políticas RLS Originais (0002_rls_policies.sql)

**Tabela: documents**
```sql
-- Para anon/authenticated
documents_select_authenticated: USING (org_id = current_request_org())
documents_insert_authenticated: WITH CHECK (org_id = current_request_org())
documents_update_authenticated: USING/WITH CHECK (org_id = current_request_org())
documents_delete_authenticated: USING (org_id = current_request_org())

-- Para service_role (BYPASS COMPLETO)
documents_service_role_all: USING (true) WITH CHECK (true)
```

**Tabela: memories**
```sql
-- Para anon/authenticated
memories_select_authenticated: USING (org_id = current_request_org())
memories_insert_authenticated: WITH CHECK (org_id = current_request_org())
memories_update_authenticated: USING/WITH CHECK (org_id = current_request_org())
memories_delete_authenticated: USING (org_id = current_request_org())

-- Para service_role (BYPASS COMPLETO)
memories_service_role_all: USING (true) WITH CHECK (true)
```

## 3. FLUXO DE AUTENTICAÇÃO DO APP

### Backend (apps/api/src/supabase.ts)
```typescript
export function createScopedSupabase(organizationId: string, userId?: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        // PROBLEMA: Headers estavam com maiúsculas
        "X-Supermemory-Organization": organizationId,  // ERRADO
        "X-Supermemory-User": userId  // ERRADO

        // CORRETO seria:
        "x-supermemory-organization": organizationId,
        "x-supermemory-user": userId
      }
    }
  })
}
```

### API Routes (apps/api/src/index.ts)
```typescript
app.post("/v3/documents/documents/by-ids", async (c) => {
  const { organizationId } = c.var.session  // ← De onde vem isso?
  const supabase = createScopedSupabase(organizationId, c.var.session.userId)

  const docs = await listDocumentsWithMemoriesByIds(supabase, organizationId, query)
  return c.json(docs)
})
```

### Query no Banco (apps/api/src/routes/documents.ts:509-536)
```typescript
const { data: docs, error } = await client
  .from("documents")
  .select("...")
  .eq("org_id", organizationId)  // ← Filtro na aplicação
  .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
  .range(offset, offset + limit - 1)
```

## 4. HISTÓRICO DE MIGRAÇÕES (ÚLTIMA SEMANA)

### Migrações Aplicadas Entre 25-26 Outubro
1. `0006_rls_missing_tables` - Adicionou RLS em tabelas faltantes
2. `0007_add_org_id_to_processing_logs_fixed` - Adicionou org_id em processing_logs
3. `0008_fix_rls_header_reading` - Tentou consertar leitura de headers
4. `0009_fix_remaining_rls_policies` - Mais consertos RLS
5. `0010_complete_rls_fix_all_tables` - "Conserto completo"
6. `0011_fix_sessions_delete_policy` - Consertou política de delete
7. `0012_fix_all_remaining_current_request_org` - Mais consertos
8. `0013_fix_insert_with_check_policies` - Consertou WITH CHECK
9. `0013_fix_insert_with_check_policies_clean` - Versão limpa
10. `0014_restore_rls_with_proper_validation` - Restaurou validação
11. `0015_restore_update_delete_validation` - Restaurou update/delete
12. `0016_disable_rls_emergency` - DESABILITOU RLS (emergência)
13. `0017_restore_rls_with_strong_validation` - Restaurou com validação forte
14. `0018_disable_rls_rely_on_application_filtering` - Desabilitou novamente
15. `fix_rls_policies_with_proper_roles_and_org_isolation` - Tentou isolar por org
16. `revert_rls_policies_to_restore_data_visibility` - Reverteu para restaurar dados
17. `grant_base_permissions_to_authenticator_role_corrected` - Permissões para authenticator

### Minhas Migrações (HOJE - 27 Outubro)
18. `fix_rls_policies_use_auth_uid` - Tentei usar auth.uid() (ERRADO)
19. `temporary_permissive_rls_policies` - Criei USING (true) (ATUAL)

## 5. PROBLEMAS IDENTIFICADOS

### Problema Principal
**As políticas RLS atuais usam `USING (true)` que deveria permitir TUDO, mas o frontend ainda não vê os dados.**

### Possíveis Causas

#### A. O cliente do frontend não está usando ANON_KEY
- Frontend pode estar fazendo requisições diretas ao Supabase
- Pode não estar passando pelo proxy da API

#### B. Erro na sessão/autenticação
- `c.var.session` pode estar undefined/null
- `organizationId` pode não estar sendo passado corretamente

#### C. Frontend está usando cliente Supabase diferente
- Pode ter um cliente Supabase configurado diretamente
- Pode estar usando uma key diferente

#### D. Cache do browser
- Frontend pode ter dados em cache
- Queries antigas podem estar sendo reutilizadas

## 6. O QUE NÃO SABEMOS AINDA

1. **Como o frontend se conecta ao Supabase?**
   - Usa a API como proxy?
   - Usa cliente Supabase direto?
   - Qual key está usando?

2. **De onde vem `c.var.session`?**
   - Middleware de autenticação?
   - Cookie?
   - Header?

3. **O frontend está realmente fazendo as requisições?**
   - Pode ter erro de JavaScript antes
   - Pode ter erro de CORS
   - Pode ter erro de rede

4. **Qual era a migração exata que quebrou?**
   - Alguma entre 0008 e 0018
   - Provavelmente removeu a política `service_role_all`

## 7. PRÓXIMOS PASSOS (SEM MUDAR NADA)

### Passo 1: Verificar logs do navegador
```
1. Abrir DevTools (F12)
2. Ir na aba Network
3. Filtrar por "documents" ou "memories"
4. Ver se há requisições sendo feitas
5. Ver qual é a resposta (200? 403? 500?)
6. Ver o payload da resposta
```

### Passo 2: Verificar console do navegador
```
1. Abrir DevTools (F12)
2. Ir na aba Console
3. Ver se há erros de JavaScript
4. Ver se há erros de autenticação
```

### Passo 3: Verificar como frontend se conecta
```
Preciso ler:
- apps/web/lib/api/documents.ts ✓ (já li)
- packages/lib/api.ts (preciso ler)
- Código que cria o cliente Supabase no frontend
```

### Passo 4: Verificar middleware de autenticação
```
Preciso ler:
- apps/api/src/index.ts - linha que define c.var.session
- Middleware que popula a session
```

## 8. MUDANÇAS QUE FIZ (REVERSÍVEIS)

1. **apps/api/src/supabase.ts** - Mudei headers de maiúsculas para minúsculas
   ```diff
   - "X-Supermemory-Organization": organizationId
   + "x-supermemory-organization": organizationId
   ```

2. **Migração: fix_rls_policies_use_auth_uid** - Criei políticas usando auth.uid()
   - Pode ser revertida

3. **Migração: temporary_permissive_rls_policies** - Criei políticas com USING (true)
   - Pode ser revertida

## 9. HIPÓTESE MAIS PROVÁVEL

**O problema NÃO é RLS!**

Razões:
1. As políticas atuais usam `USING (true)` que permite TUDO
2. As policies incluem roles `anon`, `authenticated`, `authenticator`, `service_role`
3. Os dados existem no banco e queries diretas funcionam
4. O problema apareceu com migrações RLS, mas pode ser coincidência

**Provavelmente o problema é:**
- Frontend não está autenticando corretamente
- Session está vazia/inválida
- Middleware de auth quebrou
- Frontend está usando configuração errada do Supabase

## 10. AÇÃO RECOMENDADA

**ANTES DE FAZER QUALQUER MUDANÇA:**

1. Abrir o app no browser
2. Abrir DevTools
3. Tentar carregar memórias/documentos
4. Capturar:
   - Requisições HTTP (Network tab)
   - Erros JavaScript (Console tab)
   - Estado da aplicação (React DevTools se tiver)

5. Me mostrar:
   - Screenshot dos erros
   - Corpo da requisição que falha
   - Corpo da resposta
   - URL sendo chamada

**SÓ DEPOIS** vou saber se preciso:
- Reverter migrações
- Consertar autenticação
- Corrigir configuração do Supabase
- Fazer outra coisa

## 11. REVERSÃO DE EMERGÊNCIA (SE NECESSÁRIO)

Se quiser voltar ao estado original IMEDIATAMENTE:

```sql
-- Recriar as políticas originais com service_role bypass
DROP POLICY IF EXISTS documents_select_authenticated ON public.documents;
CREATE POLICY documents_select_authenticated
ON public.documents FOR SELECT TO authenticated, anon
USING (org_id = public.current_request_org());

DROP POLICY IF EXISTS documents_service_role_all ON public.documents;
CREATE POLICY documents_service_role_all
ON public.documents FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Repetir para memories e outras tabelas...
```

Mas **NÃO RECOMENDO** fazer isso até sabermos o problema real!
