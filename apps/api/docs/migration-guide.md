# Migration Guide

> **Complete guide for migrating from legacy services to the new architecture**
>
> Last Updated: January 2025

## Table of Contents

1. [Overview](#overview)
2. [Breaking Changes](#breaking-changes)
3. [Migration Strategy](#migration-strategy)
4. [Step-by-Step Migration](#step-by-step-migration)
5. [Code Examples](#code-examples)
6. [Common Patterns](#common-patterns)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Plan](#rollback-plan)

---

## Overview

### What Changed?

The document processing system has been refactored from monolithic services to a modular, service-oriented architecture:

**Before (Legacy)**:
```
extractor.ts    → Single file with all extraction logic
preview.ts      → Single file with all preview logic
ingestion.ts    → Single file orchestrating everything
```

**After (New Architecture)**:
```
services/
├── extraction/
│   ├── document-extractor-service.ts
│   ├── pdf-extractor.ts
│   ├── youtube-extractor.ts
│   └── ...
├── processing/
│   ├── document-processor.ts
│   ├── chunking-service.ts
│   └── ...
├── preview/
│   ├── preview-generator.ts
│   └── ...
└── orchestration/
    └── ingestion-orchestrator.ts
```

### Why Migrate?

✅ **Better Separation of Concerns**: Each service has a single responsibility

✅ **Improved Testability**: Services can be tested in isolation

✅ **Enhanced Resilience**: Built-in circuit breakers and retry logic

✅ **Better Performance**: Optimized batching and caching

✅ **Type Safety**: Comprehensive TypeScript interfaces

✅ **Easier Maintenance**: Clear interfaces and documentation

---

## Breaking Changes

### 1. Import Paths Changed

**Before**:
```typescript
import { extractContent } from './services/extractor';
import { generatePreview } from './services/preview';
import { processDocument } from './services/ingestion';
```

**After**:
```typescript
import { createDocumentExtractorService } from './services/extraction';
import { createPreviewGeneratorService } from './services/preview';
import { createIngestionOrchestrator } from './services/orchestration';
```

### 2. Function Signatures Changed

**Before**:
```typescript
async function extractContent(
  url: string,
  type: string
): Promise<{ text: string; title: string }>
```

**After**:
```typescript
async function extract(
  input: ExtractionInput
): Promise<ExtractionResult>
```

### 3. Service Initialization Required

**Before**:
```typescript
// Functions could be called directly
const result = await extractContent(url, 'url');
```

**After**:
```typescript
// Services must be initialized first
const service = createDocumentExtractorService();
await service.initialize();
const result = await service.extract({ url, type: 'url' });
```

### 4. Error Types Changed

**Before**:
```typescript
try {
  await extractContent(url, 'url');
} catch (error) {
  console.error(error.message);
}
```

**After**:
```typescript
try {
  await service.extract(input);
} catch (error) {
  // Now errors have structured info
  console.error(error.code);        // 'EXTRACTION_FAILED'
  console.log(error.recoverable);   // true/false
  console.log(error.retryable);     // true/false
}
```

---

## Migration Strategy

### Phase 1: Parallel Running (Recommended)

Run both old and new systems simultaneously during transition:

```typescript
// Route uses new architecture
import { createIngestionOrchestrator } from './services/orchestration';
import { processDocument as processDocumentLegacy } from './services/ingestion';

const orchestrator = createIngestionOrchestrator();
await orchestrator.initialize();

app.post('/api/documents', async (c) => {
  const useNewArchitecture = c.req.header('X-Use-New-Architecture') === 'true';

  if (useNewArchitecture) {
    // New architecture
    return await orchestrator.processDocument(input);
  } else {
    // Legacy fallback
    return await processDocumentLegacy(input);
  }
});
```

### Phase 2: Gradual Rollout

Roll out the new architecture gradually by feature or user segment:

```typescript
const shouldUseNewArchitecture = (userId: string): boolean => {
  // Start with 10% of users
  const rolloutPercentage = 10;
  const hash = hashUserId(userId);
  return (hash % 100) < rolloutPercentage;
};

if (shouldUseNewArchitecture(userId)) {
  return await orchestrator.processDocument(input);
} else {
  return await processDocumentLegacy(input);
}
```

### Phase 3: Full Migration

Switch completely to new architecture:

```typescript
// Remove legacy imports
// import { processDocument as processDocumentLegacy } from './services/ingestion';

// Use only new architecture
const result = await orchestrator.processDocument(input);
```

---

## Step-by-Step Migration

### Step 1: Update Dependencies

```bash
# No new dependencies needed
# All changes are internal restructuring
bun install
```

### Step 2: Create Service Instances

**Create a services initialization file** (`src/services/index.ts`):

```typescript
import {
  createDocumentExtractorService,
  createDocumentProcessorService,
  createPreviewGeneratorService,
  createIngestionOrchestrator
} from './services';

// Singleton instances
let extractorService: DocumentExtractorService;
let processorService: DocumentProcessorService;
let previewService: PreviewGeneratorService;
let orchestratorService: IngestionOrchestratorService;

export async function initializeServices() {
  // Create services
  extractorService = createDocumentExtractorService({
    pdf: {
      ocrEnabled: true,
      ocrProvider: 'replicate'
    },
    circuitBreaker: {
      enabled: true
    }
  });

  processorService = createDocumentProcessorService({
    chunking: {
      chunkSize: 800,
      chunkOverlap: 100
    },
    embedding: {
      provider: 'voyage',
      batchSize: 10
    }
  });

  previewService = createPreviewGeneratorService();

  orchestratorService = createIngestionOrchestrator();

  // Initialize all services
  await Promise.all([
    extractorService.initialize(),
    processorService.initialize(),
    previewService.initialize(),
    orchestratorService.initialize()
  ]);

  // Register services with orchestrator
  orchestratorService.setExtractorService(extractorService);
  orchestratorService.setProcessorService(processorService);
  orchestratorService.setPreviewService(previewService);

  console.log('All services initialized');
}

export function getServices() {
  return {
    extractor: extractorService,
    processor: processorService,
    previewer: previewService,
    orchestrator: orchestratorService
  };
}
```

### Step 3: Initialize Services on Startup

**Update your main server file**:

```typescript
import { Hono } from 'hono';
import { initializeServices } from './services';

const app = new Hono();

// Initialize services before starting server
await initializeServices();

// Your routes here
app.post('/api/documents', documentRoutes);

export default app;
```

### Step 4: Update Route Handlers

**Before**:
```typescript
// routes/documents.ts
import { processDocument } from '../services/ingestion';

app.post('/api/documents', async (c) => {
  const { url, type, userId, organizationId } = await c.req.json();

  const result = await processDocument({
    url,
    type,
    userId,
    organizationId
  });

  return c.json(result);
});
```

**After**:
```typescript
// routes/documents.ts
import { getServices } from '../services';

app.post('/api/documents', async (c) => {
  const { url, type, userId, organizationId } = await c.req.json();

  const { orchestrator } = getServices();

  const result = await orchestrator.processDocument({
    url,
    type,
    userId,
    organizationId
  });

  return c.json(result);
});
```

### Step 5: Update Tests

**Before**:
```typescript
import { extractContent } from '../services/extractor';

describe('Extraction', () => {
  it('should extract content', async () => {
    const result = await extractContent('https://example.com', 'url');
    expect(result.text).toBeDefined();
  });
});
```

**After**:
```typescript
import { createDocumentExtractorService } from '../services/extraction';

describe('Extraction', () => {
  let service: DocumentExtractorService;

  beforeAll(async () => {
    service = createDocumentExtractorService();
    await service.initialize();
  });

  afterAll(async () => {
    await service.cleanup();
  });

  it('should extract content', async () => {
    const result = await service.extract({
      url: 'https://example.com',
      type: 'url'
    });
    expect(result.text).toBeDefined();
  });
});
```

---

## Code Examples

### Example 1: Simple Document Processing

**Before**:
```typescript
import { processDocument } from './services/ingestion';

async function handleDocument(url: string, userId: string) {
  try {
    const result = await processDocument({
      url,
      type: 'url',
      userId,
      organizationId: 'org-123'
    });

    return result;
  } catch (error) {
    console.error('Processing failed:', error);
    throw error;
  }
}
```

**After**:
```typescript
import { getServices } from './services';

async function handleDocument(url: string, userId: string) {
  const { orchestrator } = getServices();

  try {
    const result = await orchestrator.processDocument({
      url,
      type: 'url',
      userId,
      organizationId: 'org-123'
    });

    return result;
  } catch (error) {
    // Enhanced error handling
    if (error.recoverable) {
      console.warn('Recoverable error, may retry:', error.code);
    } else {
      console.error('Fatal error:', error.code);
    }
    throw error;
  }
}
```

### Example 2: PDF Processing

**Before**:
```typescript
import { extractPDF } from './services/extractor';

async function processPDF(buffer: Buffer) {
  const extracted = await extractPDF(buffer);
  return extracted;
}
```

**After**:
```typescript
import { getServices } from './services';

async function processPDF(buffer: Buffer) {
  const { extractor } = getServices();

  const result = await extractor.extract({
    fileBuffer: buffer,
    fileName: 'document.pdf',
    type: 'pdf'
  });

  return result;
}
```

### Example 3: Preview Generation

**Before**:
```typescript
import { generatePreview } from './services/preview';

async function getPreview(url: string, title: string) {
  const preview = await generatePreview({ url, title });
  return preview.imageUrl;
}
```

**After**:
```typescript
import { getServices } from './services';

async function getPreview(url: string, title: string) {
  const { previewer, extractor } = getServices();

  // First extract content
  const extraction = await extractor.extract({ url, type: 'url' });

  // Then generate preview
  const preview = await previewer.generate(extraction);

  return preview.imageUrl;
}
```

### Example 4: Batch Processing

**Before**:
```typescript
async function processBatch(urls: string[]) {
  const results = [];

  for (const url of urls) {
    const result = await processDocument({
      url,
      type: 'url',
      userId: 'user-123',
      organizationId: 'org-456'
    });
    results.push(result);
  }

  return results;
}
```

**After**:
```typescript
import { getServices } from './services';

async function processBatch(urls: string[]) {
  const { orchestrator } = getServices();

  // Process in parallel with new architecture
  const results = await Promise.allSettled(
    urls.map(url =>
      orchestrator.processDocument({
        url,
        type: 'url',
        userId: 'user-123',
        organizationId: 'org-456'
      })
    )
  );

  return results;
}
```

---

## Common Patterns

### Pattern 1: Dependency Injection

**Old Pattern** (hard-coded dependencies):
```typescript
async function processDocument(input) {
  // Hardcoded dependencies
  const extracted = await extractContent(input.url);
  const processed = await processContent(extracted);
  return processed;
}
```

**New Pattern** (dependency injection):
```typescript
class DocumentProcessor {
  constructor(
    private extractor: DocumentExtractorService,
    private processor: DocumentProcessorService
  ) {}

  async processDocument(input: ProcessDocumentInput) {
    const extracted = await this.extractor.extract(input);
    const processed = await this.processor.process(extracted);
    return processed;
  }
}

// Usage
const processor = new DocumentProcessor(extractorService, processorService);
```

### Pattern 2: Error Handling

**Old Pattern**:
```typescript
try {
  await processDocument(input);
} catch (error) {
  console.error(error);
  throw error;
}
```

**New Pattern**:
```typescript
try {
  await orchestrator.processDocument(input);
} catch (error) {
  if (error.code === 'CIRCUIT_BREAKER_OPEN') {
    // Service temporarily unavailable
    return { status: 'retry_later' };
  } else if (error.recoverable) {
    // Log and retry
    console.warn('Recoverable error:', error.code);
    throw error;
  } else {
    // Fatal error
    console.error('Fatal error:', error.code);
    throw error;
  }
}
```

### Pattern 3: Configuration

**Old Pattern**:
```typescript
// Configuration scattered across files
const PDF_OCR_ENABLED = process.env.PDF_OCR_ENABLED === 'true';
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '800');
```

**New Pattern**:
```typescript
// Centralized configuration
const config = {
  extraction: {
    pdf: {
      ocrEnabled: process.env.PDF_OCR_ENABLED === 'true',
      ocrProvider: 'replicate'
    }
  },
  processing: {
    chunking: {
      chunkSize: parseInt(process.env.CHUNK_SIZE || '800'),
      chunkOverlap: 100
    }
  }
};

const orchestrator = createIngestionOrchestrator(config);
```

---

## Troubleshooting

### Issue 1: Services Not Initialized

**Error**:
```
Error: Service not initialized. Call initialize() first.
```

**Solution**:
```typescript
// Make sure to initialize services before use
const service = createDocumentExtractorService();
await service.initialize();  // ← Don't forget this!

const result = await service.extract(input);
```

### Issue 2: Missing Service Dependencies

**Error**:
```
Error: Extractor service not registered
```

**Solution**:
```typescript
// Register all services with orchestrator
orchestrator.setExtractorService(extractorService);
orchestrator.setProcessorService(processorService);
orchestrator.setPreviewService(previewService);
```

### Issue 3: Type Errors

**Error**:
```
Type 'string' is not assignable to type 'ExtractionInput'
```

**Solution**:
```typescript
// Use proper input types
const result = await service.extract({
  url: 'https://example.com',
  type: 'url'  // ← type is required
});
```

### Issue 4: Import Errors

**Error**:
```
Cannot find module './services/extractor'
```

**Solution**:
```typescript
// Update import paths
// Old: import { extractContent } from './services/extractor';
// New:
import { createDocumentExtractorService } from './services/extraction';
```

### Issue 5: Legacy Function Not Found

**Error**:
```
extractContent is not a function
```

**Solution**:
Either:
1. Update to new API (recommended)
2. Use compatibility layer (temporary)

```typescript
// Temporary compatibility layer
export async function extractContent(url: string, type: string) {
  const { extractor } = getServices();
  const result = await extractor.extract({ url, type });
  return {
    text: result.text,
    title: result.title || ''
  };
}
```

---

## Rollback Plan

If issues arise during migration, you can rollback:

### Step 1: Keep Legacy Code

Don't delete legacy files immediately:

```typescript
// services/legacy/
├── extractor.ts     (keep temporarily)
├── preview.ts       (keep temporarily)
└── ingestion.ts     (keep temporarily)
```

### Step 2: Feature Flag

Use feature flags for easy rollback:

```typescript
const USE_NEW_ARCHITECTURE = process.env.USE_NEW_ARCHITECTURE === 'true';

if (USE_NEW_ARCHITECTURE) {
  return await orchestrator.processDocument(input);
} else {
  return await processDocumentLegacy(input);
}
```

### Step 3: Monitoring

Monitor key metrics during migration:

```typescript
// Track success rates
const metrics = {
  newArchitecture: { success: 0, failed: 0 },
  legacy: { success: 0, failed: 0 }
};

// If new architecture has issues, rollback
if (metrics.newArchitecture.failed / metrics.newArchitecture.success > 0.05) {
  console.warn('High failure rate, rolling back');
  process.env.USE_NEW_ARCHITECTURE = 'false';
}
```

---

## Migration Checklist

- [ ] Read architecture overview documentation
- [ ] Review new service interfaces
- [ ] Create service initialization code
- [ ] Update import statements
- [ ] Initialize services on startup
- [ ] Update route handlers
- [ ] Update tests
- [ ] Test in development environment
- [ ] Deploy to staging with feature flag
- [ ] Monitor metrics
- [ ] Gradual rollout to production
- [ ] Remove legacy code (after full migration)

---

## Summary

The migration to the new architecture provides significant benefits:

✅ **Better Code Organization**: Clear separation of concerns

✅ **Improved Reliability**: Built-in resilience patterns

✅ **Enhanced Performance**: Optimized processing

✅ **Easier Testing**: Isolated, mockable services

✅ **Better Maintainability**: Clear interfaces and documentation

### Timeline Recommendation

- **Week 1**: Development environment migration
- **Week 2**: Staging deployment with 10% rollout
- **Week 3**: Production rollout to 50%
- **Week 4**: Full production rollout
- **Week 5**: Remove legacy code

---

**Need Help?**

- Check [Services Usage Guide](./services-usage.md)
- Review [Architecture Overview](./architecture-overview.md)
- Open GitHub issue for problems
- Ask in team discussion

**Happy Migrating! 🚀**
