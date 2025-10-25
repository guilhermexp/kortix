# Data Model Index - Quick Reference

**The Single Source of Truth for Supermemory Architecture**

---

## 📂 Files in This Data Model System

### 1. **DATA_MODEL_REFERENCE.md** ⭐ START HERE
**Purpose:** Authoritative data model documentation
**Contains:**
- 18 table definitions with all columns
- Column types, nullability, defaults
- Relationships between tables
- Enums and constants
- Validation rules per table
- Query patterns

**Use When:** You need to understand a table, column, or relationship
**Example Questions:**
- "What columns does the documents table have?"
- "What are valid DocumentStatus values?"
- "How are memories related to documents?"

---

### 2. **packages/validation/data-model.ts** 🔧 USE IN CODE
**Purpose:** TypeScript types and Zod validation schemas
**Contains:**
- Type definitions for every entity
- Create schemas for validation
- Enum definitions (matching reference)
- Type guards
- Utility functions

**Use When:** Writing application code
**Example:**
```typescript
import {
  Document,
  DocumentStatus,
  CreateDocumentSchema,
  validateData,
} from "@/packages/validation/data-model"
```

---

### 3. **CODE_GENERATION_GUARDRAILS.md** 🚦 FOLLOW THESE RULES
**Purpose:** Rules and patterns for safe code generation
**Contains:**
- 8 critical rules (MUST follow)
- Query pattern library (copy-paste safe)
- Dangerous patterns (NEVER use)
- Code review checklist

**Use When:** Writing database code
**Example:** Before writing a SELECT, check Rule 1 (org isolation)

---

### 4. **DATA_MODEL_IMPLEMENTATION_GUIDE.md** 📚 COMPLETE GUIDE
**Purpose:** How to use the data model system
**Contains:**
- Quick start guide
- Common scenarios (step-by-step)
- Validation examples
- Common mistakes to avoid

**Use When:** Learning how to use the system
**Example:** "How do I create a document?"

---

## 🗺️ Decision Tree

```
Do you need to...

├─ Understand a table/column?
│  └─ Read: DATA_MODEL_REFERENCE.md

├─ Write TypeScript code?
│  ├─ Import types from: packages/validation/data-model.ts
│  └─ Follow rules in: CODE_GENERATION_GUARDRAILS.md

├─ Generate database query?
│  └─ Copy pattern from: CODE_GENERATION_GUARDRAILS.md

├─ Validate input data?
│  └─ Use schema from: packages/validation/data-model.ts

├─ Review code for correctness?
│  └─ Use checklist from: CODE_GENERATION_GUARDRAILS.md

├─ Learn how to use this system?
│  └─ Read: DATA_MODEL_IMPLEMENTATION_GUIDE.md

└─ Something else?
   └─ Check this index for keywords
```

---

## 🔑 Key Concepts

### 1. Single Source of Truth
All code must align with `DATA_MODEL_REFERENCE.md`. Don't make assumptions.

### 2. Organization Isolation
Every query MUST include `.eq("org_id", organizationId)`

### 3. Type Safety
Use enums and types from `data-model.ts`, never hardcoded strings

### 4. Validation
Use Zod schemas to validate all input before using

### 5. Patterns
Copy query patterns from guardrails, customize as needed

---

## 📊 Quick Stats

| Metric | Count |
|--------|-------|
| Total Tables | 18 |
| Total Columns | 200+ |
| Enums Defined | 6 |
| Foreign Keys | 40+ |
| RLS-Enabled Tables | 13 |
| TypeScript Types | 30+ |
| Zod Schemas | 30+ |

---

## ⚡ Essential Rules (Memorize These)

### Rule 1️⃣: Every Query Needs org_id
```typescript
.eq("org_id", organizationId)  // ← ALWAYS REQUIRED
```

### Rule 2️⃣: Every Insert Needs org_id
```typescript
{ org_id: organizationId, ...data }  // ← ALWAYS REQUIRED
```

### Rule 3️⃣: Use Enums, Never Hardcoded Strings
```typescript
DocumentStatus.Done   // ✅
"done"               // ❌
```

### Rule 4️⃣: Validate Input with Zod
```typescript
validateData(CreateDocumentSchema, input)  // ✅
```

### Rule 5️⃣: Timestamps are ISO 8601
```typescript
new Date().toISOString()  // ✅
new Date()               // ❌
```

---

## 🗄️ All Tables (Quick Reference)

### Core Content Tables
- **documents** - Notes, links, files
- **document_chunks** - Tokenized segments
- **memories** - Semantic memory storage
- **memory_relationships** - Memory graph edges
- **spaces** - Projects/workspaces

### User & Organization Tables
- **organizations** - Multi-tenant container
- **users** - User accounts
- **organization_members** - User roles per org
- **sessions** - Authentication sessions

### Integration Tables
- **connections** - OAuth integrations
- **connection_states** - OAuth state tracking
- **api_keys** - API authentication
- **api_requests** - API audit log

### System Tables
- **ingestion_jobs** - Document processing jobs
- **processing_logs** - Processing audit trail
- **organization_settings** - Org-level config
- **password_resets** - Password reset tokens

---

## 📚 All Enums (Quick Reference)

```typescript
DocumentStatus
├─ unknown, queued, extracting, chunking
├─ embedding, indexing, done, failed

DocumentType
├─ text, link, file, email

ConnectionProvider
├─ google_drive, notion, onedrive

OrganizationRole
├─ owner, admin, member

Visibility
├─ private, shared, public

RelationshipType
├─ related, references, contradicts, similar, extends
```

---

## 🎯 Common Tasks

### Task: Create a Document
1. Read: DATA_MODEL_REFERENCE.md → documents
2. Use schema: `CreateDocumentSchema`
3. Copy pattern: CODE_GENERATION_GUARDRAILS.md → INSERT Pattern
4. Customize and test

### Task: List Documents
1. Read: CODE_GENERATION_GUARDRAILS.md → List with Pagination pattern
2. Add org_id filter: `.eq("org_id", organizationId)`
3. Test pagination

### Task: Update Document Status
1. Copy: CODE_GENERATION_GUARDRAILS.md → Update Pattern
2. Use enum: `DocumentStatus.Done`
3. Filter by org_id and id

### Task: Delete Documents
1. Copy: CODE_GENERATION_GUARDRAILS.md → Delete Pattern
2. Filter by org_id first
3. Validate deletion success

### Task: Validate Input
1. Import schema: `CreateDocumentSchema`
2. Call: `validateData(CreateDocumentSchema, input)`
3. Handle validation errors

---

## 🔍 Search by Table Name

| Table | Reference | Key Fields | FK Constraints |
|-------|-----------|-----------|-----------------|
| organizations | REF:4 | id, slug, name | 15 incoming |
| users | REF:5 | id, email | 9 incoming |
| organization_members | REF:6 | id, organization_id, user_id | 2 outgoing |
| sessions | REF:7 | id, user_id, organization_id | 2 outgoing |
| spaces | REF:8 | id, organization_id, container_tag | 1 outgoing |
| documents | REF:9 | id, org_id, user_id | 2 outgoing |
| documents_to_spaces | REF:10 | document_id, space_id | 2 outgoing |
| document_chunks | REF:11 | id, document_id, org_id | 2 outgoing |
| memories | REF:12 | id, org_id, user_id | 2 outgoing |
| memory_relationships | REF:13 | id, org_id, source_memory_id, target_memory_id | 3 outgoing |
| api_keys | REF:14 | id, org_id, user_id | 2 outgoing |
| connections | REF:15 | id, org_id, user_id | 2 outgoing |
| organization_settings | REF:16 | id, org_id | 1 outgoing |
| ingestion_jobs | REF:17 | id, document_id, org_id | 2 outgoing |
| processing_logs | REF:18 | id, job_id, org_id | 2 outgoing |
| connection_states | REF:19 | id, org_id, user_id, connection_id | 3 outgoing |
| api_requests | REF:20 | id, org_id, user_id, key_id | 3 outgoing |
| password_resets | REF:21 | id, user_id, org_id | 2 outgoing |

---

## 🔍 Search by Field Name

### org_id Fields (Organization Isolation)
- documents.org_id
- document_chunks.org_id
- memories.org_id
- memory_relationships.org_id
- connections.org_id
- ingestion_jobs.org_id
- processing_logs.org_id
- api_keys.org_id
- api_requests.org_id
- connection_states.org_id
- organization_settings.org_id
- password_resets.org_id

**Rule:** Every SELECT must filter by org_id ✅

### Status Fields
- documents.status (DocumentStatus enum)
- ingestion_jobs.status (IngestionJobStatus enum)
- processing_logs.status (string: running, success, error)

**Rule:** Always use enums ✅

### Embedding Fields
- documents.summary_embedding (vector 1536d)
- document_chunks.embedding (vector 1536d)
- memories.memory_embedding (vector 1536d)

**Note:** Migration support for new embeddings (_new fields)

### Timestamp Fields
- All tables have created_at (immutable)
- Most have updated_at (mutable)

**Rule:** Always ISO 8601 UTC ✅

---

## 🚀 Getting Started (5 Minutes)

1. **Read** DATA_MODEL_REFERENCE.md (overview section)
2. **Skim** CODE_GENERATION_GUARDRAILS.md (8 rules)
3. **Bookmark** this index
4. **Copy** first query pattern
5. **Start coding** with confidence ✅

---

## 📞 Need Help?

1. **Understanding a table?** → DATA_MODEL_REFERENCE.md
2. **Writing code?** → packages/validation/data-model.ts
3. **Writing a query?** → CODE_GENERATION_GUARDRAILS.md
4. **Learning how to use this?** → DATA_MODEL_IMPLEMENTATION_GUIDE.md
5. **Still confused?** → Re-read this index

---

## ✅ Checklist Before Committing Code

- [ ] All queries filter by org_id
- [ ] All inserts include org_id
- [ ] Using enums, not hardcoded strings
- [ ] Input validated with Zod
- [ ] Timestamps in ISO 8601
- [ ] Foreign keys validated
- [ ] Error handling present
- [ ] Code passes guardrails checklist

---

## 🎓 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-25 | Initial release with 18 tables, complete reference |

---

**This is the single source of truth for Supermemory data architecture.**

**All code generation must respect this data model.**

**When in doubt, check the reference.** 📖

---

**Last Updated:** 2025-10-25
**Authority:** Claude Code
**Status:** PRODUCTION READY ✅
