# Code Generation Guardrails

**Purpose:** Ensure AI-generated code respects data model constraints
**Authority:** DATA_MODEL_REFERENCE.md
**Status:** ACTIVE

---

## 🚦 Critical Rules (MUST ALWAYS Follow)

### Rule 1: Organization Isolation
**Priority:** 🔴 CRITICAL

Every database query MUST filter by organization.

```typescript
// ✅ CORRECT
const { data } = await client
  .from("documents")
  .select("*")
  .eq("org_id", organizationId)  // ← REQUIRED

// ❌ WRONG
const { data } = await client
  .from("documents")
  .select("*")  // No org_id filter!

// ❌ WRONG
const { data } = await client
  .from("documents")
  .select("*")
  .eq("user_id", userId)  // Only user filter, missing org filter!
```

**When to trigger:** Before any query generation
**Enforcement:** Code review, linting, runtime validation

---

### Rule 2: INSERT Always Includes org_id
**Priority:** 🔴 CRITICAL

Every INSERT statement must include org_id or organization_id.

```typescript
// ✅ CORRECT - org_id is set
const { data } = await client
  .from("documents")
  .insert({
    id: crypto.randomUUID(),
    org_id: organizationId,  // ← REQUIRED
    user_id: userId,
    title: "Note",
    content: "...",
  })

// ❌ WRONG - missing org_id
const { data } = await client
  .from("documents")
  .insert({
    id: crypto.randomUUID(),
    user_id: userId,
    title: "Note",
    content: "...",
    // org_id is missing!
  })
```

**Affected Tables:**
- documents (org_id)
- document_chunks (org_id)
- memories (org_id)
- spaces (organization_id)
- sessions (organization_id)
- connections (org_id)
- api_keys (org_id)
- ingestion_jobs (org_id)
- memory_relationships (org_id)
- organization_settings (org_id)
- api_requests (org_id)
- processing_logs (org_id)
- connection_states (org_id)

---

### Rule 3: Use Correct Enums
**Priority:** 🔴 CRITICAL

Only use enum values defined in data-model.ts

```typescript
// ✅ CORRECT
const doc = {
  status: DocumentStatus.Done,
  type: DocumentType.Text,
  provider: ConnectionProvider.GoogleDrive,
}

// ❌ WRONG - hardcoded strings (brittle)
const doc = {
  status: "done",        // Use DocumentStatus.Done instead
  type: "text",          // Use DocumentType.Text instead
  provider: "google_drive",  // Use ConnectionProvider.GoogleDrive
}

// ❌ WRONG - spelling variations
const doc = {
  status: "completed",   // Should be "done"
  type: "plain_text",    // Should be "text"
  provider: "Google Drive",  // Should be "google_drive"
}
```

**Valid Enum Values:**

| Field | Enum | Values |
|-------|------|--------|
| documents.status | DocumentStatus | unknown, queued, extracting, chunking, embedding, indexing, done, failed |
| documents.type | DocumentType | text, link, file, email |
| spaces.visibility | Visibility | private, shared, public |
| connections.provider | ConnectionProvider | google_drive, notion, onedrive |
| organization_members.role | OrganizationRole | owner, admin, member |
| memory_relationships.relationship_type | RelationshipType | related, references, contradicts, similar, extends |

---

### Rule 4: Validate Foreign Keys
**Priority:** 🟠 HIGH

Before referencing a foreign key, verify it exists and belongs to org.

```typescript
// ✅ CORRECT - validate first
const document = await getDocumentByIdAndOrg(documentId, organizationId)
if (!document) {
  throw new Error("Document not found or doesn't belong to your organization")
}

const chunk = await client
  .from("document_chunks")
  .insert({
    id: crypto.randomUUID(),
    document_id: documentId,  // ← Verified to exist
    org_id: organizationId,
    content: "...",
  })

// ❌ WRONG - trust the input (unsafe)
const chunk = await client
  .from("document_chunks")
  .insert({
    id: crypto.randomUUID(),
    document_id: documentId,  // ← No verification!
    org_id: organizationId,
    content: "...",
  })
```

**Tables with Important FKs:**
- documents_to_spaces: requires valid document_id, space_id
- document_chunks: requires valid document_id
- memories: requires valid document_id (if set)
- memory_relationships: requires valid source/target memory_ids

---

### Rule 5: Timestamps in ISO 8601 UTC
**Priority:** 🟠 HIGH

All timestamps must be ISO 8601 strings in UTC.

```typescript
// ✅ CORRECT
const created_at = new Date().toISOString()  // "2025-10-25T22:30:00.000Z"
const expires_at = new Date(Date.now() + 7*24*60*60*1000).toISOString()

// ❌ WRONG - JavaScript Date object
const created_at = new Date()  // Not ISO string

// ❌ WRONG - milliseconds since epoch
const created_at = Date.now()  // 1729888200000

// ❌ WRONG - local timezone
const created_at = new Date().toString()  // "Thu Oct 25 2025 22:30:00..."
```

---

### Rule 6: Handle NULL vs Undefined
**Priority:** 🟠 HIGH

Be explicit about NULL fields.

```typescript
// ✅ CORRECT
const doc = {
  title: title || null,           // Explicitly NULL if empty
  summary: summary || null,       // Explicitly NULL if empty
  metadata: metadata || {},       // Empty object, not NULL
}

// ❌ WRONG - undefined fields get ignored
const doc = {
  title: title,                   // Fails if undefined
  summary: summary,               // Fails if undefined
}

// ❌ WRONG - mixing NULL and undefined
const doc = {
  title: title !== "" ? title : undefined,  // Should be NULL
  summary: summary || null,
}
```

---

### Rule 7: Validate Input with Zod
**Priority:** 🟠 HIGH

Validate all incoming data with schemas from data-model.ts

```typescript
// ✅ CORRECT
import { CreateDocumentSchema, validateData } from "@/packages/validation/data-model"

export async function createDocument(input: unknown) {
  const payload = validateData(CreateDocumentSchema, input)

  const { data } = await client
    .from("documents")
    .insert(payload)
}

// ❌ WRONG - no validation
export async function createDocument(input: any) {
  const { data } = await client
    .from("documents")
    .insert(input)  // ← Could be anything!
}
```

---

### Rule 8: Use Transactions for Multi-Table Changes
**Priority:** 🟡 MEDIUM

Multi-table operations should use RPC functions or transactions.

```typescript
// ✅ CORRECT - use RPC transaction
const { data } = await client.rpc("create_document_with_spaces", {
  org_id: organizationId,
  user_id: userId,
  document: { title, content },
  space_ids: [space1, space2],
})

// ❌ WRONG - separate calls (can be inconsistent)
const { data: doc } = await client
  .from("documents")
  .insert({ org_id, user_id, title, content })
  .select()
  .single()

const { data: link } = await client
  .from("documents_to_spaces")
  .insert({ document_id: doc.id, space_id: space1 })
  // If this fails, document exists but no space link!
```

---

## 🛠️ Query Pattern Library

### SELECT Patterns

#### Single Record
```typescript
const { data, error } = await client
  .from("documents")
  .select("*")
  .eq("org_id", organizationId)
  .eq("id", documentId)
  .single()

if (error) throw error
return data
```

#### List with Pagination
```typescript
const page = 0
const pageSize = 50

const { data, count, error } = await client
  .from("documents")
  .select("*", { count: "exact" })
  .eq("org_id", organizationId)
  .order("created_at", { ascending: false })
  .range(page * pageSize, (page + 1) * pageSize - 1)

if (error) throw error
return { data, total: count }
```

#### Search with Filter
```typescript
const { data, error } = await client
  .from("documents")
  .select("*")
  .eq("org_id", organizationId)
  .eq("status", "done")
  .ilike("title", `%${query}%`)

if (error) throw error
return data
```

#### Vector Search
```typescript
const { data, error } = await client.rpc("match_document_chunks", {
  query_embedding: embedding,
  match_threshold: 0.5,
  match_count: 10,
  org_id: organizationId,
})

if (error) throw error
return data
```

### INSERT Patterns

#### Single Record
```typescript
const { data, error } = await client
  .from("documents")
  .insert({
    id: crypto.randomUUID(),
    org_id: organizationId,
    user_id: userId,
    title: payload.title,
    content: payload.content,
    type: DocumentType.Text,
    status: DocumentStatus.Done,
  })
  .select()
  .single()

if (error) throw error
return data
```

#### Batch Insert
```typescript
const { data, error } = await client
  .from("document_chunks")
  .insert(
    chunks.map((chunk, index) => ({
      id: crypto.randomUUID(),
      document_id: documentId,
      org_id: organizationId,
      content: chunk.text,
      type: "text",
      position: index,
    }))
  )
  .select()

if (error) throw error
return data
```

### UPDATE Patterns

#### Update Fields
```typescript
const { data, error } = await client
  .from("documents")
  .update({
    title: newTitle,
    summary: newSummary,
    updated_at: new Date().toISOString(),
  })
  .eq("org_id", organizationId)
  .eq("id", documentId)
  .select()

if (error) throw error
return data
```

### DELETE Patterns

#### Delete Single
```typescript
const { error } = await client
  .from("documents")
  .delete()
  .eq("org_id", organizationId)
  .eq("id", documentId)

if (error) throw error
```

#### Delete Multiple
```typescript
const { error } = await client
  .from("documents")
  .delete()
  .eq("org_id", organizationId)
  .in("id", documentIds)

if (error) throw error
```

---

## ✅ Pre-Generation Checklist

Before writing any database code, verify:

- [ ] **Organization filter?** Every SELECT has `.eq("org_id", organizationId)`
- [ ] **org_id in INSERT?** Every INSERT includes org_id or organization_id
- [ ] **Enum values?** Using defined enums, not hardcoded strings
- [ ] **Foreign keys validated?** Referenced records exist and belong to org
- [ ] **ISO 8601 timestamps?** Using `.toISOString()` not `Date()` or `Date.now()`
- [ ] **NULL vs undefined?** Explicit `|| null` for nullable fields
- [ ] **Zod validation?** Input validated before using
- [ ] **Transaction needed?** Multi-table changes use RPC or transaction
- [ ] **Error handling?** Checking error objects after queries
- [ ] **Immutable operations?** No updating timestamps or org_id

---

## 🚫 Dangerous Patterns (Never Use)

### Pattern 1: No Organization Filter
```typescript
// ❌ DANGEROUS
const docs = await client.from("documents").select("*")
// Returns documents from ALL organizations!
```

### Pattern 2: Hardcoded Enums
```typescript
// ❌ DANGEROUS
status: "done"  // What if value changes?

// ✅ CORRECT
status: DocumentStatus.Done
```

### Pattern 3: Trusting Input
```typescript
// ❌ DANGEROUS
const doc = await client.from("documents").insert(req.body)
// req.body could be anything!

// ✅ CORRECT
const payload = validateData(CreateDocumentSchema, req.body)
const doc = await client.from("documents").insert(payload)
```

### Pattern 4: Mixing JavaScript Dates
```typescript
// ❌ DANGEROUS
created_at: new Date()  // Local timezone!

// ✅ CORRECT
created_at: new Date().toISOString()  // UTC
```

### Pattern 5: No Transaction for Atomic Operations
```typescript
// ❌ DANGEROUS
await client.from("documents").insert(doc)
await client.from("documents_to_spaces").insert(link)
// If second fails, first succeeded - inconsistent state!

// ✅ CORRECT
await client.rpc("create_document_with_space", { doc, spaceId })
```

### Pattern 6: Forgetting NULL Fields
```typescript
// ❌ DANGEROUS
const doc = {
  title: userInput.title,  // Could be undefined!
  summary: userInput.summary,
}

// ✅ CORRECT
const doc = {
  title: userInput.title || null,
  summary: userInput.summary || null,
}
```

---

## 📋 Code Review Checklist

When reviewing AI-generated code:

1. **Org Isolation**
   - [ ] Every SELECT filters by org_id
   - [ ] No cross-org data access
   - [ ] org_id comes from session, not user input

2. **Data Integrity**
   - [ ] Every INSERT includes org_id
   - [ ] Foreign keys validated
   - [ ] No orphaned records possible

3. **Type Safety**
   - [ ] Using enums from data-model.ts
   - [ ] No hardcoded string literals
   - [ ] Zod schemas for validation

4. **Error Handling**
   - [ ] Checking error objects
   - [ ] Descriptive error messages
   - [ ] Proper HTTP status codes

5. **Performance**
   - [ ] Using indexes (org_id, id)
   - [ ] Limiting result sets
   - [ ] No N+1 queries

---

## 🔗 References

- [DATA_MODEL_REFERENCE.md](./DATA_MODEL_REFERENCE.md) - Authoritative data model
- [packages/validation/data-model.ts](./packages/validation/data-model.ts) - TypeScript schemas
- [FINAL_SECURITY_DECISION.md](./FINAL_SECURITY_DECISION.md) - Security architecture

---

**Last Updated:** 2025-10-25
**Authority:** Claude Code
**Enforcement:** Code Review, Linting, Runtime Validation
