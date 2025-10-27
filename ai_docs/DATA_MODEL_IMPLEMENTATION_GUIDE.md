# Data Model Implementation Guide

**Purpose:** Complete guide to using the centralized data model
**Status:** ✅ READY FOR USE
**Date:** 2025-10-25

---

## 📚 Overview

The data model is the **single source of truth** for Supermemory. It ensures consistency, safety, and maintainability across the entire codebase.

### What You Get

```
DATA_MODEL_REFERENCE.md
├─ 18 tables documented
├─ Column specifications
├─ Relationships mapped
├─ Enums defined
└─ Validation rules

packages/validation/data-model.ts
├─ TypeScript types (auto-generated from docs)
├─ Zod validation schemas
├─ Type guards
└─ Utility functions

CODE_GENERATION_GUARDRAILS.md
├─ Critical rules (MUST follow)
├─ Query patterns (COPY & PASTE)
├─ Dangerous patterns (NEVER use)
└─ Review checklist
```

---

## 🚀 Quick Start

### 1. Import Types and Schemas

```typescript
import {
  // Types
  Document,
  Memory,
  Organization,
  Session,

  // Enums
  DocumentStatus,
  DocumentType,
  ConnectionProvider,
  OrganizationRole,

  // Schemas
  CreateDocumentSchema,
  DocumentSchema,
  SessionContextSchema,

  // Utilities
  validateData,
  isDocumentStatus,
} from "@/packages/validation/data-model"
```

### 2. Validate Input

```typescript
// Validate and parse input
const payload = validateData(CreateDocumentSchema, req.body)
// Throws error if invalid, returns typed data if valid
```

### 3. Query Database

```typescript
// Query respecting org_id (from guardrails)
const { data } = await client
  .from("documents")
  .select("*")
  .eq("org_id", organizationId)  // Required!
  .eq("status", DocumentStatus.Done)  // Use enum!
  .single()
```

---

## 📖 Using DATA_MODEL_REFERENCE.md

This document is your authority for all data questions.

### Example: Adding a Document

**Question:** What fields are required when creating a document?

**Answer:** Check `documents` table in DATA_MODEL_REFERENCE.md

```markdown
# documents
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | ❌ | gen_random_uuid() | Primary Key |
| org_id | uuid | ❌ | - | FK → organizations.id |
| user_id | uuid | ❌ | - | FK → users.id |
```

**Required fields:** id, org_id, user_id, and others without ❌

**Implementation:**

```typescript
const doc = {
  id: crypto.randomUUID(),
  org_id: organizationId,  // Required
  user_id: userId,         // Required
  title: "My Note",        // Optional (nullable)
  content: "...",          // Optional (nullable)
  type: DocumentType.Text, // Default = "text"
  status: DocumentStatus.Unknown, // Default = "unknown"
  chunk_count: 0,          // Required, has default
}
```

---

## 💾 Using packages/validation/data-model.ts

This file contains all TypeScript types and validation.

### Type Inference

```typescript
// Type automatically inferred from schema
const document: Document = {
  id: "...",
  org_id: "...",
  // IDE autocomplete shows all fields!
}

// Or infer from schema directly
type MyCustomType = z.infer<typeof CreateDocumentSchema>
```

### Validation

```typescript
// Parse and validate
const doc = CreateDocumentSchema.parse(userInput)
// Throws error if invalid

// Safe parse
const result = CreateDocumentSchema.safeParse(userInput)
if (!result.success) {
  console.error(result.error.flatten().fieldErrors)
} else {
  console.log(result.data)  // Type is CreateDocument
}

// Using utility function
const doc = validateData(CreateDocumentSchema, userInput)
// Throws descriptive error
```

### Type Guards

```typescript
// Check if value is valid enum
if (isDocumentStatus(value)) {
  // value is DocumentStatus type
  console.log(value)  // "done", "queued", etc.
}

if (isDocumentType(value)) {
  // value is DocumentType type
  console.log(value)  // "text", "link", "file", "email"
}
```

---

## 🛣️ Using CODE_GENERATION_GUARDRAILS.md

This file is your checklist for writing safe database code.

### Before Writing Any Query

1. **Read the relevant rule**
   - Rule 1: Organization Isolation
   - Rule 2: INSERT Always Includes org_id
   - Rule 3: Use Correct Enums
   - etc.

2. **Copy query pattern** from "Query Pattern Library"
   ```typescript
   // Copy from guardrails
   const { data, error } = await client
     .from("documents")
     .select("*")
     .eq("org_id", organizationId)
     .eq("id", documentId)
     .single()
   ```

3. **Customize for your case**
   ```typescript
   const { data: document, error } = await client
     .from("documents")
     .select("*")
     .eq("org_id", organizationId)
     .eq("status", DocumentStatus.Done)
     .single()
   ```

4. **Run checklist**
   - [ ] Organization filter present?
   - [ ] org_id in INSERT?
   - [ ] Enum values used?
   - etc.

---

## 🔐 Common Scenarios

### Scenario 1: Create a Document

**Files to check:**
1. DATA_MODEL_REFERENCE.md → documents table
2. data-model.ts → CreateDocumentSchema
3. CODE_GENERATION_GUARDRAILS.md → INSERT Patterns

**Implementation:**

```typescript
import { CreateDocumentSchema, DocumentStatus, validateData } from "@/packages/validation/data-model"

export async function createDocument(input: unknown, context: SessionContext) {
  // 1. Validate input
  const payload = validateData(CreateDocumentSchema, input)

  // 2. Add org_id and user_id from session
  const docData = {
    ...payload,
    id: crypto.randomUUID(),
    org_id: context.organizationId,  // From session
    user_id: context.userId,          // From session
    status: DocumentStatus.Unknown,   // Default status
  }

  // 3. Insert into database
  const { data, error } = await client
    .from("documents")
    .insert(docData)
    .select()
    .single()

  if (error) throw error
  return data
}
```

### Scenario 2: List Documents with Pagination

**Files to check:**
1. CODE_GENERATION_GUARDRAILS.md → List with Pagination pattern
2. data-model.ts → Document type

**Implementation:**

```typescript
export async function listDocuments(
  context: SessionContext,
  options: { page?: number; limit?: number; status?: DocumentStatus } = {}
) {
  const page = options.page ?? 0
  const limit = options.limit ?? 50

  const { data, count, error } = await client
    .from("documents")
    .select("*", { count: "exact" })
    .eq("org_id", context.organizationId)  // Required!
    ...(options.status && eq("status", options.status))
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (error) throw error
  return {
    documents: data as Document[],
    total: count,
    page,
    pageSize: limit,
    pages: Math.ceil((count ?? 0) / limit),
  }
}
```

### Scenario 3: Update Memory with Relationships

**Files to check:**
1. DATA_MODEL_REFERENCE.md → memories, memory_relationships
2. CODE_GENERATION_GUARDRAILS.md → Update Patterns, Transactions

**Implementation:**

```typescript
export async function updateMemoryWithRelationships(
  context: SessionContext,
  memoryId: string,
  updates: Partial<Memory>,
  relationshipIds: string[]
) {
  // Use transaction to ensure consistency
  const result = await client.rpc("update_memory_with_relationships", {
    org_id: context.organizationId,
    memory_id: memoryId,
    updates: {
      ...updates,
      updated_at: new Date().toISOString(),
    },
    relationship_ids: relationshipIds,
  })

  if (result.error) throw result.error
  return result.data
}
```

### Scenario 4: Search Documents

**Files to check:**
1. CODE_GENERATION_GUARDRAILS.md → Search with Filter pattern
2. data-model.ts → Document type

**Implementation:**

```typescript
export async function searchDocuments(
  context: SessionContext,
  query: string
) {
  const { data, error } = await client
    .from("documents")
    .select("id, title, summary, created_at")
    .eq("org_id", context.organizationId)  // Required!
    .eq("status", DocumentStatus.Done)     // Only completed docs
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)

  if (error) throw error
  return data as Pick<Document, "id" | "title" | "summary" | "created_at">[]
}
```

---

## 🔍 Validation Examples

### Example 1: Validate Create Request

```typescript
import { CreateDocumentSchema, validateData } from "@/packages/validation/data-model"

// In your API endpoint
export async function POST(req: Request) {
  try {
    const body = await req.json()

    // This will throw if invalid
    const payload = validateData(CreateDocumentSchema, body)

    // payload is now typed and safe
    return Response.json({ success: true, data: payload })
  } catch (error) {
    // Validation failed
    return Response.json(
      { error: error.message },
      { status: 400 }
    )
  }
}
```

### Example 2: Safe Parse Pattern

```typescript
import { DocumentSchema } from "@/packages/validation/data-model"

// Get data from database
const dbResult = await client.from("documents").select().single()

// Parse it (should always succeed for DB data, but good practice)
const result = DocumentSchema.safeParse(dbResult)

if (!result.success) {
  // Database returned invalid data (shouldn't happen)
  console.error("Database data validation failed:", result.error)
  return null
}

// result.data is fully typed as Document
return result.data
```

---

## 📋 Data Model Relationships

### Organization → Everything

Every record belongs to exactly one organization.

```
organizations
  ├─ users (many-to-many via organization_members)
  ├─ spaces (one-to-many)
  ├─ documents (one-to-many)
  │  ├─ document_chunks (one-to-many)
  │  └─ documents_to_spaces (junction)
  ├─ memories (one-to-many)
  │  └─ memory_relationships (directed graph)
  ├─ api_keys (one-to-many)
  ├─ sessions (one-to-many)
  └─ ... (and more)
```

### Key Principle

**Never query without filtering by org_id.**

```typescript
// ❌ BAD - could return data from other orgs
const docs = await client.from("documents").select("*")

// ✅ GOOD - only your org's data
const docs = await client
  .from("documents")
  .select("*")
  .eq("org_id", organizationId)
```

---

## 🧪 Testing Data Model Changes

If you need to modify the data model:

1. **Update DATA_MODEL_REFERENCE.md** (source of truth)
2. **Update data-model.ts** (types and schemas)
3. **Update CODE_GENERATION_GUARDRAILS.md** if needed
4. **Create migration** in database
5. **Run tests** to verify schema changes
6. **Update this guide** with new patterns

---

## 🚨 Common Mistakes

### Mistake 1: Forgetting org_id Filter
```typescript
// ❌ BAD
const doc = await getDocumentById(docId)

// ✅ GOOD
const doc = await getDocumentById(docId, organizationId)
```

### Mistake 2: Using Hardcoded Status Values
```typescript
// ❌ BAD
.eq("status", "done")

// ✅ GOOD
.eq("status", DocumentStatus.Done)
```

### Mistake 3: Not Validating Input
```typescript
// ❌ BAD
const doc = await insertDocument(req.body)

// ✅ GOOD
const payload = validateData(CreateDocumentSchema, req.body)
const doc = await insertDocument(payload)
```

### Mistake 4: Mixing Timestamps
```typescript
// ❌ BAD
created_at: new Date()
expires_at: Date.now()

// ✅ GOOD
created_at: new Date().toISOString()
expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString()
```

### Mistake 5: Not Using RPC for Transactions
```typescript
// ❌ BAD - could be inconsistent
await insert(doc)
await insert(link)

// ✅ GOOD - atomic operation
await rpc("create_with_link", { doc, link })
```

---

## 📞 When In Doubt

1. **Check DATA_MODEL_REFERENCE.md** for table structure
2. **Check data-model.ts** for types and validation
3. **Check CODE_GENERATION_GUARDRAILS.md** for patterns
4. **Ask in code review** if unsure

---

## ✅ Ready to Code

You now have everything needed to:

- ✅ Create type-safe database queries
- ✅ Validate all input data
- ✅ Maintain multi-tenant isolation
- ✅ Follow best practices
- ✅ Generate consistent AI code
- ✅ Pass code reviews

**All from a single source of truth.** 🎯

---

**Last Updated:** 2025-10-25
**Authority:** Data Model Architecture Team
**Status:** PRODUCTION READY
