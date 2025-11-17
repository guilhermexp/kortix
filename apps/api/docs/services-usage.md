# Services Usage Guide

> **Comprehensive guide to using the Supermemory document processing services**
>
> Last Updated: January 2025

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Service Architecture](#service-architecture)
4. [DocumentExtractorService](#documentextractorservice)
5. [DocumentProcessorService](#documentprocessorservice)
6. [PreviewGeneratorService](#previewgeneratorservice)
7. [IngestionOrchestratorService](#ingestionorchestratorservice)
8. [Advanced Usage](#advanced-usage)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)
11. [Performance Optimization](#performance-optimization)

---

## Overview

The Supermemory API provides a comprehensive set of services for document ingestion and processing. The architecture follows a clean separation of concerns with four main service layers:

1. **Extraction Layer** - Extracts content from various sources
2. **Processing Layer** - Processes extracted content (chunking, embedding, summarization)
3. **Preview Layer** - Generates preview images
4. **Orchestration Layer** - Coordinates the complete pipeline

### Key Features

- ✅ **Multi-Format Support**: PDFs, URLs, YouTube, files, repositories
- ✅ **Intelligent Fallbacks**: Automatic fallback chains for resilience
- ✅ **OCR Integration**: Deepseek OCR and Gemini Vision for scanned documents
- ✅ **Circuit Breaker Pattern**: Protection against cascading failures
- ✅ **Retry Logic**: Exponential backoff with jitter
- ✅ **Performance Monitoring**: Built-in metrics and tracking
- ✅ **Type Safety**: Full TypeScript support with comprehensive interfaces

---

## Quick Start

### Basic Document Ingestion

```typescript
import { createIngestionOrchestrator } from './services/orchestration';

// Create orchestrator
const orchestrator = createIngestionOrchestrator();
await orchestrator.initialize();

// Process a URL
const result = await orchestrator.processDocument({
  url: 'https://example.com/article',
  type: 'url',
  userId: 'user-123',
  organizationId: 'org-456'
});

console.log('Document processed:', result.documentId);
console.log('Status:', result.status);
console.log('Summary:', result.processed.summary);
```

### Using Individual Services

```typescript
import {
  createDocumentExtractorService,
  createDocumentProcessorService,
  createPreviewGeneratorService
} from './services';

// Initialize services
const extractor = createDocumentExtractorService();
await extractor.initialize();

const processor = createDocumentProcessorService({
  chunking: { chunkSize: 800, chunkOverlap: 100 },
  embedding: { provider: 'voyage', batchSize: 10 }
});
await processor.initialize();

const previewer = createPreviewGeneratorService();
await previewer.initialize();

// Extract content
const extraction = await extractor.extract({
  url: 'https://example.com/article',
  type: 'url'
});

// Process content
const processed = await processor.process(extraction);

// Generate preview
const preview = await previewer.generate(extraction);
```

---

## Service Architecture

### Service Hierarchy

```
IngestionOrchestratorService (Top Level)
├── DocumentExtractorService
│   ├── FirecrawlExtractor
│   ├── YouTubeExtractor
│   ├── PDFExtractor
│   └── FileExtractor
├── DocumentProcessorService
│   ├── ChunkingService
│   ├── EmbeddingService
│   ├── SummarizationService
│   └── TaggingService
└── PreviewGeneratorService
    ├── ImageExtractor
    ├── SVGGenerator
    └── FaviconExtractor
```

### Service Base Class

All services extend `BaseService` which provides:
- Lifecycle management (`initialize()`, `cleanup()`, `healthCheck()`)
- Error handling with `ProcessingError`
- Performance monitoring via `PerformanceMonitor`
- Logging with context
- State management

---

## DocumentExtractorService

### Purpose

Extracts content from various sources with automatic extractor selection and fallback.

### Supported Content Types

| Content Type | Extractor | Priority | Features |
|--------------|-----------|----------|----------|
| YouTube Videos | YouTubeExtractor | 15 | Transcript, AI summary, metadata |
| PDF Documents | PDFExtractor | 12 (OCR) / 8 | OCR (Deepseek/Gemini), text extraction |
| Web URLs | FirecrawlExtractor | 10 | Full page scraping, metadata |
| Generic Files | FileExtractor | 5 | MarkItDown, various formats |

### Basic Usage

```typescript
import { createDocumentExtractorService } from './services/extraction';

const extractor = createDocumentExtractorService();
await extractor.initialize();

// Extract from URL
const urlResult = await extractor.extract({
  url: 'https://example.com/article',
  type: 'url'
});

// Extract from PDF with OCR
const pdfResult = await extractor.extract({
  fileBuffer: pdfBuffer,
  fileName: 'document.pdf',
  type: 'pdf'
});

// Extract YouTube transcript
const youtubeResult = await extractor.extract({
  url: 'https://youtube.com/watch?v=abc123',
  type: 'url'
});
```

### Advanced Configuration

```typescript
const extractor = createDocumentExtractorService({
  // PDF Configuration
  pdf: {
    enabled: true,
    ocrEnabled: true,
    ocrProvider: 'replicate' // or 'gemini'
  },

  // YouTube Configuration
  youtube: {
    enabled: true,
    preferredLanguages: ['en', 'en-US', 'pt', 'pt-BR']
  },

  // Circuit Breaker
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 60000,
    monitoringWindow: 300000
  },

  // Retry Logic
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  }
});
```

### Checking Extractor Support

```typescript
// Check if input can be handled
const canHandle = extractor.canHandle({
  url: 'https://youtube.com/watch?v=abc123'
});

// Get specific extractor
const pdfExtractor = extractor.getExtractor('pdf');

// Get all extractors
const allExtractors = extractor.getExtractors();
console.log('Available:', Array.from(allExtractors.keys()));
```

### Validation

```typescript
try {
  await extractor.validateInput({
    url: 'https://example.com',
    type: 'url'
  });
  console.log('Input is valid');
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

### Working with PDFs

```typescript
// PDF with OCR (for scanned documents)
const pdfExtractor = extractor.getExtractor('pdf');

// Check if PDF is scanned
const isScanned = await pdfExtractor.isScannedPDF(pdfBuffer);

// Extract with specific OCR provider
const result = await pdfExtractor.extractFromPDF(pdfBuffer, {
  useOCR: true,
  ocrProvider: 'replicate' // Deepseek OCR
});

// Extract metadata
const metadata = await pdfExtractor.extractMetadata(pdfBuffer);
console.log('Pages:', metadata.pageCount);
console.log('Author:', metadata.author);
```

### Working with YouTube

```typescript
const youtubeExtractor = extractor.getExtractor('youtube');

// Parse video ID
const videoId = youtubeExtractor.parseVideoId(
  'https://youtube.com/watch?v=dQw4w9WgXcQ'
);

// Extract with custom languages
const result = await youtubeExtractor.extractTranscript(videoId, {
  preferredLanguages: ['pt', 'pt-BR', 'en'],
  includeAutoGenerated: true,
  minLength: 500
});

// Get metadata
const metadata = await youtubeExtractor.extractMetadata(videoId);
```

---

## DocumentProcessorService

### Purpose

Processes extracted content through chunking, embedding, summarization, and tagging.

### Processing Pipeline

1. **Chunking** - Splits text into semantic chunks (default: 800 tokens)
2. **Embedding** - Generates vector embeddings (1536-dimensional)
3. **Summarization** - Creates AI-powered summary using OpenRouter/Gemini
4. **Tagging** - Extracts relevant tags and categories

### Basic Usage

```typescript
import { createDocumentProcessorService } from './services/processing';

const processor = createDocumentProcessorService();
await processor.initialize();

// Process extracted document
const processed = await processor.process(extractionResult);

console.log('Chunks:', processed.chunks.length);
console.log('Summary:', processed.summary);
console.log('Tags:', processed.tags);
```

### Advanced Configuration

```typescript
const processor = createDocumentProcessorService({
  // Chunking Configuration
  chunking: {
    enabled: true,
    chunkSize: 800,
    chunkOverlap: 100,
    respectSentences: true,
    respectParagraphs: true
  },

  // Embedding Configuration
  embedding: {
    enabled: true,
    provider: 'voyage', // or 'openai', 'gemini'
    batchSize: 10,
    useCache: true,
    dimensions: 1536
  },

  // Summarization Configuration
  summarization: {
    enabled: true,
    provider: 'openrouter', // or 'gemini'
    maxLength: 500,
    style: 'concise'
  },

  // Tagging Configuration
  tagging: {
    enabled: true,
    maxTags: 10,
    locale: 'en',
    provider: 'openrouter'
  }
});
```

### Selective Processing

```typescript
// Process without summary
const result1 = await processor.process(extraction, {
  skipSummary: true
});

// Process without tags
const result2 = await processor.process(extraction, {
  skipTags: true
});

// Custom chunking
const result3 = await processor.process(extraction, {
  chunkSize: 1000,
  chunkOverlap: 200
});

// Minimal processing (chunks + embeddings only)
const result4 = await processor.process(extraction, {
  skipSummary: true,
  skipTags: true
});
```

### Performance Metrics

```typescript
const result = await processor.process(extraction);

console.log('Processing metrics:', result.metrics);
// {
//   chunkingTime: 125,
//   embeddingTime: 1250,
//   summarizationTime: 2300,
//   taggingTime: 800,
//   totalTime: 4475
// }
```

---

## PreviewGeneratorService

### Purpose

Generates preview images using intelligent fallback chain.

### Fallback Strategies

1. **Image Extraction** (Priority: 3)
   - Extracts og:image from meta tags
   - Extracts twitter:image
   - Validates image accessibility

2. **SVG Generation** (Priority: 2)
   - Generates gradient SVG with first letter
   - Customizable colors and styles

3. **Favicon Extraction** (Priority: 1)
   - Falls back to website favicon
   - Uses Google Favicon service
   - Supports high-resolution icons

### Basic Usage

```typescript
import { createPreviewGeneratorService } from './services/preview';

const previewer = createPreviewGeneratorService();
await previewer.initialize();

// Generate preview
const preview = await previewer.generate(extractionResult);

console.log('Image URL:', preview.imageUrl);
console.log('Strategy used:', preview.strategy);
console.log('Resolution:', preview.width, 'x', preview.height);
```

### Advanced Configuration

```typescript
const previewer = createPreviewGeneratorService({
  enableImageExtraction: true,
  enableSvgGeneration: true,
  enableFaviconExtraction: true,
  preferHighResolution: true,
  timeout: 15000, // Total timeout
  strategyTimeout: 5000, // Per-strategy timeout
  fallbackChain: ['image', 'svg', 'favicon']
});
```

### Custom Fallback Chain

```typescript
// Try only image extraction
const preview1 = await previewer.generate(extraction, {
  fallbackChain: ['image']
});

// Skip SVG, go straight to favicon
const preview2 = await previewer.generate(extraction, {
  fallbackChain: ['image', 'favicon']
});

// Force SVG generation
const preview3 = await previewer.generate(extraction, {
  fallbackChain: ['svg']
});
```

### Working with Specific Generators

```typescript
// Image extractor
const imageExtractor = previewer.getGenerator('image');
const imageUrl = await imageExtractor.extractImage(url);

// SVG generator
const svgGenerator = previewer.getGenerator('svg');
const svgData = await svgGenerator.generateSVG({
  title: 'Example',
  url: 'https://example.com'
});

// Favicon extractor
const faviconExtractor = previewer.getGenerator('favicon');
const faviconUrl = await faviconExtractor.extractFavicon(url);
```

---

## IngestionOrchestratorService

### Purpose

Coordinates the complete document ingestion pipeline with state management, error handling, and persistence.

### Complete Workflow

1. **Extraction** - Extract content using DocumentExtractorService
2. **Processing** - Process content using DocumentProcessorService
3. **Preview** - Generate preview using PreviewGeneratorService
4. **Storage** - Store all data to Supabase database

### Basic Usage

```typescript
import { createIngestionOrchestrator } from './services/orchestration';

const orchestrator = createIngestionOrchestrator();
await orchestrator.initialize();

// Process document
const result = await orchestrator.processDocument({
  url: 'https://example.com/article',
  type: 'url',
  userId: 'user-123',
  organizationId: 'org-456'
});

console.log('Document ID:', result.documentId);
console.log('Status:', result.status);
console.log('Extraction:', result.extraction);
console.log('Processed:', result.processed);
console.log('Preview:', result.preview);
```

### Service Registration

```typescript
import {
  createDocumentExtractorService,
  createDocumentProcessorService,
  createPreviewGeneratorService,
  createIngestionOrchestrator
} from './services';

// Create services
const extractor = createDocumentExtractorService();
const processor = createDocumentProcessorService();
const previewer = createPreviewGeneratorService();
const orchestrator = createIngestionOrchestrator();

// Initialize all services
await extractor.initialize();
await processor.initialize();
await previewer.initialize();
await orchestrator.initialize();

// Register services with orchestrator
orchestrator.setExtractorService(extractor);
orchestrator.setProcessorService(processor);
orchestrator.setPreviewService(previewer);

// Now ready to process documents
const result = await orchestrator.processDocument({...});
```

### Processing Different Content Types

```typescript
// Process URL
const urlResult = await orchestrator.processDocument({
  url: 'https://example.com/article',
  type: 'url',
  userId: 'user-123',
  organizationId: 'org-456'
});

// Process PDF
const pdfResult = await orchestrator.processDocument({
  fileBuffer: pdfBuffer,
  fileName: 'document.pdf',
  type: 'pdf',
  userId: 'user-123',
  organizationId: 'org-456'
});

// Process YouTube
const youtubeResult = await orchestrator.processDocument({
  url: 'https://youtube.com/watch?v=abc123',
  type: 'url',
  userId: 'user-123',
  organizationId: 'org-456'
});

// Process text content
const textResult = await orchestrator.processDocument({
  originalContent: 'Your text here...',
  type: 'text',
  userId: 'user-123',
  organizationId: 'org-456'
});
```

### Custom Processing Options

```typescript
const result = await orchestrator.processDocument({
  url: 'https://example.com',
  type: 'url',
  userId: 'user-123',
  organizationId: 'org-456',

  // Custom processing options
  processingOptions: {
    skipSummary: false,
    skipTags: false,
    chunkSize: 1000,
    chunkOverlap: 150
  },

  // Custom preview options
  previewOptions: {
    fallbackChain: ['image', 'favicon'],
    preferHighResolution: true
  }
});
```

### Job Queue Integration

```typescript
// Queue document for background processing
const jobId = await orchestrator.queueDocument({
  url: 'https://example.com/article',
  type: 'url',
  userId: 'user-123',
  organizationId: 'org-456',
  priority: 'high'
});

// Check job status
const job = await orchestrator.getJobStatus(jobId);
console.log('Job status:', job.status);
console.log('Progress:', job.progress);

// Wait for completion
const result = await orchestrator.waitForJob(jobId, {
  timeout: 60000,
  pollInterval: 1000
});
```

### State Management

```typescript
// Get processing state
const state = orchestrator.getProcessingState(documentId);
console.log('Status:', state.status);
console.log('Internal status:', state.internalStatus);
console.log('Retry count:', state.retryCount);

// Get all processing states
const allStates = orchestrator.getAllStates();
```

---

## Advanced Usage

### Custom Extractors

```typescript
import { BaseService } from './services/base';
import type { DocumentExtractor, ExtractionInput, ExtractionResult } from './services/interfaces';

class CustomExtractor extends BaseService implements DocumentExtractor {
  canHandle(input: ExtractionInput): boolean {
    return input.type === 'custom';
  }

  getPriority(): number {
    return 10;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    // Custom extraction logic
    return {
      text: 'Extracted content',
      title: 'Document Title',
      source: 'custom',
      url: input.url,
      wordCount: 100,
      extractorUsed: 'CustomExtractor'
    };
  }

  async validateInput(input: ExtractionInput): Promise<void> {
    if (input.type !== 'custom') {
      throw new Error('Invalid input type');
    }
  }
}

// Register custom extractor
const extractor = createDocumentExtractorService();
extractor.extractors.set('custom', new CustomExtractor());
```

### Custom Processing Steps

```typescript
// Add custom post-processing
const processor = createDocumentProcessorService();

const originalProcess = processor.process.bind(processor);
processor.process = async (extraction, options) => {
  const result = await originalProcess(extraction, options);

  // Custom post-processing
  result.customField = computeCustomMetrics(result);

  return result;
};
```

### Batch Processing

```typescript
async function batchProcessDocuments(
  urls: string[],
  orchestrator: IngestionOrchestratorService
) {
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

  const successful = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  return { successful, failed };
}
```

### Progressive Processing

```typescript
// Process with progress callbacks
const orchestrator = createIngestionOrchestrator();

orchestrator.on('extraction:start', (data) => {
  console.log('Extraction started:', data);
});

orchestrator.on('extraction:complete', (data) => {
  console.log('Extraction complete:', data);
});

orchestrator.on('processing:start', (data) => {
  console.log('Processing started:', data);
});

orchestrator.on('processing:complete', (data) => {
  console.log('Processing complete:', data);
});

const result = await orchestrator.processDocument({...});
```

---

## Error Handling

### Error Types

```typescript
interface ProcessingError extends Error {
  code: string;
  message: string;
  recoverable: boolean;
  retryable: boolean;
  details?: Record<string, any>;
}
```

### Common Error Codes

| Code | Description | Recoverable | Retry |
|------|-------------|-------------|-------|
| `EXTRACTION_FAILED` | Content extraction failed | Yes | Yes |
| `NO_SUITABLE_EXTRACTOR` | No extractor for input | No | No |
| `INVALID_INPUT` | Invalid input parameters | No | No |
| `CIRCUIT_BREAKER_OPEN` | Service unavailable | Yes | Yes |
| `TIMEOUT` | Operation timed out | Yes | Yes |
| `RATE_LIMIT_EXCEEDED` | Rate limit hit | Yes | Yes |
| `PROCESSING_FAILED` | Processing step failed | Yes | Yes |
| `STORAGE_FAILED` | Database storage failed | Yes | Yes |

### Try-Catch Pattern

```typescript
try {
  const result = await orchestrator.processDocument(input);
  console.log('Success:', result.documentId);
} catch (error) {
  if (error.code === 'CIRCUIT_BREAKER_OPEN') {
    console.error('Service temporarily unavailable');
    // Wait and retry
  } else if (error.recoverable) {
    console.error('Recoverable error, retrying...');
    // Implement retry logic
  } else {
    console.error('Fatal error:', error.message);
    // Log and notify
  }
}
```

### Graceful Degradation

```typescript
async function processWithFallback(input: ProcessDocumentInput) {
  try {
    return await orchestrator.processDocument(input);
  } catch (error) {
    if (error.code === 'PROCESSING_FAILED') {
      // Try minimal processing
      return await orchestrator.processDocument({
        ...input,
        processingOptions: {
          skipSummary: true,
          skipTags: true
        }
      });
    }
    throw error;
  }
}
```

### Circuit Breaker Handling

```typescript
const orchestrator = createIngestionOrchestrator({
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 60000
  }
});

orchestrator.on('circuit-breaker:open', (service) => {
  console.warn(`Circuit breaker open for ${service}`);
  // Notify monitoring system
});

orchestrator.on('circuit-breaker:half-open', (service) => {
  console.info(`Circuit breaker half-open for ${service}`);
});

orchestrator.on('circuit-breaker:closed', (service) => {
  console.info(`Circuit breaker closed for ${service}`);
});
```

---

## Best Practices

### 1. Service Initialization

```typescript
// ✅ Good: Initialize once, reuse
const orchestrator = createIngestionOrchestrator();
await orchestrator.initialize();

async function processMany(urls: string[]) {
  return Promise.all(urls.map(url =>
    orchestrator.processDocument({ url, ... })
  ));
}

// ❌ Bad: Create new instance each time
async function processBad(url: string) {
  const orchestrator = createIngestionOrchestrator();
  await orchestrator.initialize();
  return orchestrator.processDocument({ url, ... });
}
```

### 2. Resource Cleanup

```typescript
// ✅ Good: Clean up resources
try {
  await orchestrator.processDocument(input);
} finally {
  await orchestrator.cleanup();
}

// Or use a wrapper
async function withOrchestrator<T>(
  fn: (orch: IngestionOrchestratorService) => Promise<T>
): Promise<T> {
  const orch = createIngestionOrchestrator();
  await orch.initialize();
  try {
    return await fn(orch);
  } finally {
    await orch.cleanup();
  }
}
```

### 3. Error Boundaries

```typescript
// ✅ Good: Handle errors at each layer
try {
  const extraction = await extractor.extract(input);

  try {
    const processed = await processor.process(extraction);

    try {
      const preview = await previewer.generate(extraction);
      return { extraction, processed, preview };
    } catch (previewError) {
      console.warn('Preview failed, continuing without preview');
      return { extraction, processed, preview: null };
    }
  } catch (processingError) {
    console.error('Processing failed:', processingError);
    throw processingError;
  }
} catch (extractionError) {
  console.error('Extraction failed:', extractionError);
  throw extractionError;
}
```

### 4. Validation First

```typescript
// ✅ Good: Validate before processing
await extractor.validateInput(input);
const result = await extractor.extract(input);

// ❌ Bad: Skip validation
const result = await extractor.extract(input);
```

### 5. Use Type Safety

```typescript
import type {
  ProcessDocumentInput,
  ProcessingResult,
  ExtractionInput
} from './services/interfaces';

// ✅ Good: Explicit types
async function processDocument(
  input: ProcessDocumentInput
): Promise<ProcessingResult> {
  return await orchestrator.processDocument(input);
}

// ❌ Bad: No types
async function processDocument(input: any): Promise<any> {
  return await orchestrator.processDocument(input);
}
```

---

## Performance Optimization

### 1. Batch Operations

```typescript
// Process embeddings in batches
const processor = createDocumentProcessorService({
  embedding: {
    batchSize: 20 // Process 20 chunks at a time
  }
});
```

### 2. Selective Processing

```typescript
// Skip expensive operations when not needed
const result = await processor.process(extraction, {
  skipSummary: true,
  skipTags: true
});
```

### 3. Caching

```typescript
// Enable embedding cache
const processor = createDocumentProcessorService({
  embedding: {
    useCache: true,
    batchSize: 10
  }
});
```

### 4. Parallel Processing

```typescript
// Process extraction and preview in parallel
const [extraction, preview] = await Promise.all([
  extractor.extract(input),
  previewer.generate(partialExtraction)
]);
```

### 5. Timeout Configuration

```typescript
const orchestrator = createIngestionOrchestrator({
  timeout: 30000, // 30 seconds total
  extraction: { timeout: 10000 },
  processing: { timeout: 15000 },
  preview: { timeout: 5000 }
});
```

### 6. Monitor Performance

```typescript
const result = await orchestrator.processDocument(input);

console.log('Performance metrics:');
console.log('- Extraction:', result.metrics.extractionTime, 'ms');
console.log('- Processing:', result.metrics.processingTime, 'ms');
console.log('- Preview:', result.metrics.previewTime, 'ms');
console.log('- Total:', result.metrics.totalTime, 'ms');

if (result.metrics.totalTime > 30000) {
  console.warn('Slow processing detected');
}
```

---

## Summary

The Supermemory services provide a robust, scalable architecture for document ingestion:

- **DocumentExtractorService**: Multi-format content extraction with fallbacks
- **DocumentProcessorService**: Chunking, embedding, summarization, and tagging
- **PreviewGeneratorService**: Preview image generation with fallback chain
- **IngestionOrchestratorService**: Complete pipeline orchestration

### Key Takeaways

1. Services are designed for **reusability** - initialize once, use many times
2. Built-in **resilience** with circuit breakers, retries, and fallbacks
3. **Type-safe** interfaces for all operations
4. **Performance-optimized** with batching, caching, and parallel processing
5. **Production-ready** with comprehensive error handling and monitoring

### Next Steps

- Read [Architecture Overview](./architecture-overview.md)
- Review [Migration Guide](./migration-guide.md)
- Explore API reference documentation
- Check out example implementations in tests

---

**Questions or Issues?**

- See GitHub Issues for known problems
- Check test files for more examples
- Review JSDoc comments in source code
