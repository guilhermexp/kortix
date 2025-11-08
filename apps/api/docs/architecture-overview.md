# Architecture Overview

> **Comprehensive overview of the refactored document processing architecture**
>
> Last Updated: January 2025

## Table of Contents

1. [Introduction](#introduction)
2. [Design Principles](#design-principles)
3. [System Architecture](#system-architecture)
4. [Service Layers](#service-layers)
5. [Data Flow](#data-flow)
6. [Service Contracts](#service-contracts)
7. [Error Handling Strategy](#error-handling-strategy)
8. [Performance Patterns](#performance-patterns)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Considerations](#deployment-considerations)

---

## Introduction

The refactored document processing architecture separates concerns into distinct, reusable services with clear responsibilities and interfaces. The architecture follows SOLID principles and implements industry-standard patterns for resilience and scalability.

### Key Improvements

- ✅ **Separation of Concerns**: Each service has a single, well-defined responsibility
- ✅ **Dependency Injection**: Services are injected rather than hardcoded
- ✅ **Interface-Based Design**: Services implement clear contracts
- ✅ **Testability**: Each service can be tested in isolation
- ✅ **Resilience**: Circuit breakers, retries, and fallbacks built-in
- ✅ **Observability**: Comprehensive logging and metrics
- ✅ **Type Safety**: Full TypeScript with strict mode

---

## Design Principles

### 1. Single Responsibility Principle (SRP)

Each service has one reason to change:

```typescript
// ✅ Good: Each service has single responsibility
DocumentExtractorService    → Extract content from sources
DocumentProcessorService    → Process extracted content
PreviewGeneratorService     → Generate preview images
IngestionOrchestratorService → Coordinate the pipeline
```

### 2. Open/Closed Principle (OCP)

Services are open for extension, closed for modification:

```typescript
// ✅ Good: Extend via configuration and interfaces
class DocumentExtractorService {
  // Closed for modification - core logic is stable
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const extractors = this.selectExtractors(input);
    return this.executeExtractorChain(input, extractors);
  }

  // Open for extension - new extractors can be added
  private registerExtractors(): void {
    if (this.config.pdf?.enabled) {
      this.extractors.set('pdf', createPDFExtractor());
    }
    // Easy to add new extractors without modifying core logic
  }
}
```

### 3. Liskov Substitution Principle (LSP)

All services extend `BaseService` and can be substituted:

```typescript
// ✅ Good: All services have consistent interface
abstract class BaseService {
  abstract initialize(): Promise<void>;
  abstract cleanup(): Promise<void>;
  abstract healthCheck(): Promise<boolean>;
}

// All services can be used polymorphically
const services: BaseService[] = [
  extractor,
  processor,
  previewer,
  orchestrator
];

await Promise.all(services.map(s => s.initialize()));
```

### 4. Interface Segregation Principle (ISP)

Small, focused interfaces rather than large ones:

```typescript
// ✅ Good: Small, focused interfaces
interface DocumentExtractor {
  canHandle(input: ExtractionInput): boolean;
  getPriority(): number;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
  validateInput(input: ExtractionInput): Promise<void>;
}

interface PDFExtractor extends DocumentExtractor {
  extractFromPDF(buffer: Buffer, options?: PDFOptions): Promise<ExtractionResult>;
  extractWithOCR(buffer: Buffer, options?: OCROptions): Promise<string>;
  isScannedPDF(buffer: Buffer): Promise<boolean>;
  extractMetadata(buffer: Buffer): Promise<PDFMetadata>;
}
```

### 5. Dependency Inversion Principle (DIP)

Depend on abstractions, not concretions:

```typescript
// ✅ Good: Orchestrator depends on interfaces
class IngestionOrchestratorService {
  private extractorService?: DocumentExtractorService;  // Interface
  private processorService?: DocumentProcessorService;  // Interface
  private previewService?: PreviewGeneratorService;     // Interface

  setExtractorService(service: DocumentExtractorService) {
    this.extractorService = service;
  }
}

// Concrete implementations can be swapped
orchestrator.setExtractorService(new DocumentExtractorService(config));
orchestrator.setExtractorService(new MockDocumentExtractorService());
```

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Hono)                        │
│  Routes: /api/documents, /api/process, /api/preview        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Orchestration Layer                            │
│          IngestionOrchestratorService                       │
│  • Pipeline coordination                                    │
│  • State management                                         │
│  • Error recovery                                           │
│  • Job queue integration                                    │
└──────┬──────────────┬──────────────┬───────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│Extractor│    │Processor│    │Preview  │
│ Service │    │ Service │    │ Service │
└────┬────┘    └────┬────┘    └────┬────┘
     │              │              │
     ▼              ▼              ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│Multiple │    │Multiple │    │Multiple │
│Extractor│    │Processing│   │Preview  │
│Types    │    │Services │    │Strategies│
└─────────┘    └─────────┘    └─────────┘
```

### Service Layer Diagram

```
BaseService (Abstract)
├── lifecycle: initialize(), cleanup(), healthCheck()
├── error handling: createError(), handleError()
├── logging: logger
└── performance: performanceMonitor

DocumentExtractorService extends BaseService
├── extractors: Map<string, DocumentExtractor>
├── circuitBreakers: Map<string, CircuitBreaker>
├── retryHandler: RetryHandler
└── methods:
    ├── extract(input)
    ├── validateInput(input)
    ├── canHandle(input)
    ├── getExtractor(name)
    └── getExtractors()

DocumentProcessorService extends BaseService
├── chunkingService: ChunkingService
├── embeddingService: EmbeddingService
├── summarizationService: SummarizationService
├── taggingService: TaggingService
└── methods:
    ├── process(extraction, options)
    └── getMetrics()

PreviewGeneratorService extends BaseService
├── imageExtractor: ImageExtractor
├── svgGenerator: SVGGenerator
├── faviconExtractor: FaviconExtractor
└── methods:
    ├── generate(extraction, options)
    ├── getGenerator(type)
    └── getMetrics()

IngestionOrchestratorService extends BaseService
├── extractorService: DocumentExtractorService
├── processorService: DocumentProcessorService
├── previewService: PreviewGeneratorService
├── circuitBreakers: Map<string, CircuitBreaker>
├── retryHandler: RetryHandler
└── methods:
    ├── processDocument(input)
    ├── queueDocument(input)
    ├── getJobStatus(jobId)
    ├── waitForJob(jobId)
    └── getProcessingState(documentId)
```

---

## Service Layers

### Layer 1: Base Services

**Purpose**: Provide common functionality for all services

**Components**:
- `BaseService`: Abstract base class with lifecycle management
- `PerformanceMonitor`: Tracks operation performance
- `Logger`: Contextual logging
- `ErrorHandler`: Consistent error handling

**Key Features**:
```typescript
abstract class BaseService {
  protected initialized: boolean = false;
  protected readonly logger: Logger;
  protected readonly performanceMonitor: PerformanceMonitor;

  async initialize(): Promise<void> {
    await this.onInitialize();
    this.initialized = true;
  }

  protected abstract onInitialize(): Promise<void>;
  protected abstract onHealthCheck(): Promise<boolean>;
  protected abstract onCleanup(): Promise<void>;
}
```

### Layer 2: Specialized Services

**Purpose**: Implement specific functionality

#### Extraction Services

```
DocumentExtractorService
├── FirecrawlExtractor      → Web scraping
├── YouTubeExtractor        → Video transcripts
├── PDFExtractor            → PDF processing + OCR
├── FileExtractor           → Generic files (MarkItDown)
└── RepositoryExtractor     → GitHub repositories
```

#### Processing Services

```
DocumentProcessorService
├── ChunkingService         → Text chunking
├── EmbeddingService        → Vector embeddings
├── SummarizationService    → AI summarization
└── TaggingService          → Tag extraction
```

#### Preview Services

```
PreviewGeneratorService
├── ImageExtractor          → Meta tag images
├── SVGGenerator            → Generated SVGs
└── FaviconExtractor        → Website favicons
```

### Layer 3: Orchestration Services

**Purpose**: Coordinate the complete workflow

```typescript
class IngestionOrchestratorService {
  // Coordinates all layers
  async processDocument(input: ProcessDocumentInput) {
    // 1. Extract
    const extraction = await this.extractorService.extract(input);

    // 2. Process
    const processed = await this.processorService.process(extraction);

    // 3. Generate preview
    const preview = await this.previewService.generate(extraction);

    // 4. Store to database
    await this.storeToDatabase(extraction, processed, preview);

    return { extraction, processed, preview };
  }
}
```

---

## Data Flow

### Complete Processing Flow

```
1. API Request
   ↓
2. Input Validation
   ↓
3. DocumentExtractorService
   ├─ Select suitable extractors
   ├─ Execute extractor chain with fallbacks
   ├─ Apply circuit breaker protection
   └─ Return ExtractionResult
   ↓
4. DocumentProcessorService
   ├─ ChunkingService: Split into chunks
   ├─ EmbeddingService: Generate embeddings (batch)
   ├─ SummarizationService: Create AI summary
   └─ TaggingService: Extract tags
   ↓
5. PreviewGeneratorService
   ├─ Try image extraction
   ├─ Fallback to SVG generation
   └─ Fallback to favicon
   ↓
6. Database Storage
   ├─ Store document metadata
   ├─ Store chunks with embeddings
   ├─ Store summary and tags
   └─ Store preview URL
   ↓
7. Return ProcessingResult
```

### Data Transformation Pipeline

```typescript
// Input → Extraction
ProcessDocumentInput → ExtractionInput → ExtractionResult
{
  url: string,
  type: string,
  userId: string
}
→
{
  url: string,
  type: string
}
→
{
  text: string,
  title: string,
  url: string,
  wordCount: number,
  extractorUsed: string
}

// Extraction → Processing
ExtractionResult → ProcessedDocument
{
  text: string,
  title: string,
  wordCount: number
}
→
{
  chunks: Chunk[],           // Text chunks with embeddings
  summary: string,           // AI-generated summary
  tags: string[],           // Extracted tags
  metrics: ProcessingMetrics // Performance data
}

// Extraction → Preview
ExtractionResult → PreviewResult
{
  title: string,
  url: string
}
→
{
  imageUrl: string,
  strategy: 'image' | 'svg' | 'favicon',
  width: number,
  height: number
}
```

---

## Service Contracts

### Interface Hierarchy

```typescript
// Base interfaces
interface Service {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

// Extraction interfaces
interface DocumentExtractor extends Service {
  canHandle(input: ExtractionInput): boolean;
  getPriority(): number;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
  validateInput(input: ExtractionInput): Promise<void>;
}

interface DocumentExtractorService extends Service {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
  validateInput(input: ExtractionInput): Promise<void>;
  getExtractors(): Map<string, DocumentExtractor>;
  getExtractor(name: string): DocumentExtractor | undefined;
  canHandle(input: ExtractionInput): boolean;
}

// Processing interfaces
interface DocumentProcessorService extends Service {
  process(
    extraction: ExtractionResult,
    options?: ProcessingOptions
  ): Promise<ProcessedDocument>;
}

// Preview interfaces
interface PreviewGeneratorService extends Service {
  generate(
    extraction: ExtractionResult,
    options?: PreviewGenerationOptions
  ): Promise<PreviewResult>;
}

// Orchestration interfaces
interface IngestionOrchestratorService extends Service {
  processDocument(input: ProcessDocumentInput): Promise<ProcessingResult>;
  queueDocument(input: QueueDocumentInput): Promise<string>;
  getJobStatus(jobId: string): Promise<JobResult>;
  waitForJob(jobId: string, options?: WaitOptions): Promise<ProcessingResult>;
  setExtractorService(service: DocumentExtractorService): void;
  setProcessorService(service: DocumentProcessorService): void;
  setPreviewService(service: PreviewGeneratorService): void;
}
```

### Type Contracts

```typescript
// Input types
interface ExtractionInput {
  type: 'url' | 'pdf' | 'text' | 'file' | 'repository';
  url?: string;
  originalContent?: string;
  fileBuffer?: Buffer;
  fileName?: string;
  mimeType?: string;
}

interface ProcessDocumentInput extends ExtractionInput {
  userId: string;
  organizationId: string;
  projectId?: string;
  processingOptions?: ProcessingOptions;
  previewOptions?: PreviewGenerationOptions;
}

// Result types
interface ExtractionResult {
  text: string;
  title: string | null;
  source: string;
  url: string | null;
  contentType?: string;
  raw?: any;
  wordCount: number;
  extractorUsed: string;
  extractionMetadata?: Record<string, any>;
}

interface ProcessedDocument {
  chunks: Chunk[];
  summary?: string;
  tags?: string[];
  metrics: ProcessingMetrics;
}

interface ProcessingResult {
  documentId: string;
  status: 'done' | 'failed';
  extraction: ExtractionResult;
  processed: ProcessedDocument;
  preview?: PreviewResult;
  error?: ProcessingError;
  metrics: {
    extractionTime: number;
    processingTime: number;
    previewTime: number;
    totalTime: number;
  };
}
```

---

## Error Handling Strategy

### Error Types Hierarchy

```typescript
interface ProcessingError extends Error {
  code: string;
  message: string;
  recoverable: boolean;
  retryable: boolean;
  details?: Record<string, any>;
}

// Specific error types
class ExtractionError extends ProcessingError {}
class ValidationError extends ProcessingError {}
class CircuitBreakerError extends ProcessingError {}
class TimeoutError extends ProcessingError {}
class StorageError extends ProcessingError {}
```

### Error Handling Flow

```
Operation Fails
    ↓
Is Retryable?
    ├─ Yes → Retry Handler
    │         ├─ Attempt 1 (delay: 1s)
    │         ├─ Attempt 2 (delay: 2s)
    │         ├─ Attempt 3 (delay: 4s)
    │         └─ Max attempts → Fail
    │
    └─ No → Immediate Failure
            ↓
Is Recoverable?
    ├─ Yes → Try Fallback
    │         ├─ Next strategy
    │         └─ Graceful degradation
    │
    └─ No → Fatal Error
            └─ Log and throw
```

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime?: Date;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitBreakerError('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

### Retry Strategy

```typescript
class RetryHandler {
  async execute<T>(
    operation: () => Promise<T>,
    config?: RetryConfig
  ): Promise<T> {
    const maxAttempts = config?.maxAttempts ?? 3;
    const baseDelay = config?.baseDelay ?? 1000;
    const maxDelay = config?.maxDelay ?? 30000;
    const backoffMultiplier = config?.backoffMultiplier ?? 2;
    const jitter = config?.jitter ?? true;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts && this.isRetryable(error)) {
          const delay = this.calculateDelay(
            baseDelay,
            maxDelay,
            attempt,
            backoffMultiplier,
            jitter
          );
          await this.sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw lastError!;
  }

  private calculateDelay(
    base: number,
    max: number,
    attempt: number,
    multiplier: number,
    jitter: boolean
  ): number {
    let delay = Math.min(base * Math.pow(multiplier, attempt - 1), max);

    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }
}
```

---

## Performance Patterns

### 1. Batching

```typescript
class EmbeddingService {
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const batchSize = this.config.batchSize;
    const batches = chunk(texts, batchSize);
    const results: number[][] = [];

    for (const batch of batches) {
      const embeddings = await this.provider.embed(batch);
      results.push(...embeddings);
    }

    return results;
  }
}
```

### 2. Caching

```typescript
class EmbeddingService {
  private cache = new Map<string, number[]>();

  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache
    if (this.config.useCache && this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    // Generate embedding
    const embedding = await this.provider.embed(text);

    // Store in cache
    if (this.config.useCache) {
      this.cache.set(text, embedding);
    }

    return embedding;
  }
}
```

### 3. Parallel Processing

```typescript
async function processMultipleDocuments(inputs: ProcessDocumentInput[]) {
  return await Promise.all(
    inputs.map(input => orchestrator.processDocument(input))
  );
}
```

### 4. Streaming

```typescript
async function* processInChunks(
  text: string,
  chunkSize: number
): AsyncGenerator<Chunk> {
  const chunks = splitIntoChunks(text, chunkSize);

  for (const chunk of chunks) {
    const embedding = await embeddingService.generateEmbedding(chunk.text);
    yield { ...chunk, embedding };
  }
}
```

### 5. Lazy Initialization

```typescript
class DocumentProcessorService {
  private _summarizationService?: SummarizationService;

  get summarizationService(): SummarizationService {
    if (!this._summarizationService) {
      this._summarizationService = createSummarizationService(this.config);
    }
    return this._summarizationService;
  }
}
```

---

## Testing Strategy

### Unit Testing

```typescript
describe('DocumentExtractorService', () => {
  let service: DocumentExtractorService;
  let mockExtractor: jest.Mocked<DocumentExtractor>;

  beforeEach(() => {
    mockExtractor = {
      canHandle: jest.fn(),
      getPriority: jest.fn(),
      extract: jest.fn(),
      validateInput: jest.fn(),
    };

    service = new DocumentExtractorService(config);
    service.extractors.set('mock', mockExtractor);
  });

  it('should extract content using suitable extractor', async () => {
    mockExtractor.canHandle.mockReturnValue(true);
    mockExtractor.getPriority.mockReturnValue(10);
    mockExtractor.extract.mockResolvedValue({
      text: 'Extracted content',
      title: 'Test',
      wordCount: 2,
    });

    const result = await service.extract({
      type: 'url',
      url: 'https://example.com'
    });

    expect(result.text).toBe('Extracted content');
  });
});
```

### Integration Testing

```typescript
describe('Document Processing Pipeline', () => {
  let orchestrator: IngestionOrchestratorService;

  beforeAll(async () => {
    orchestrator = createIngestionOrchestrator();
    await orchestrator.initialize();
  });

  it('should process document end-to-end', async () => {
    const result = await orchestrator.processDocument({
      originalContent: 'Test content',
      type: 'text',
      userId: 'test-user',
      organizationId: 'test-org'
    });

    expect(result.status).toBe('done');
    expect(result.extraction).toBeDefined();
    expect(result.processed).toBeDefined();
    expect(result.preview).toBeDefined();
  });
});
```

### Performance Testing

```typescript
describe('Performance', () => {
  it('should process 100 documents under 5 minutes', async () => {
    const startTime = Date.now();
    const inputs = generateTestInputs(100);

    const results = await Promise.all(
      inputs.map(input => orchestrator.processDocument(input))
    );

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5 * 60 * 1000);
    expect(results.every(r => r.status === 'done')).toBe(true);
  });
});
```

---

## Deployment Considerations

### Environment Configuration

```typescript
// Production configuration
const productionConfig = {
  extraction: {
    pdf: {
      ocrEnabled: true,
      ocrProvider: 'replicate',
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      resetTimeout: 60000,
    },
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
    },
  },
  processing: {
    embedding: {
      provider: 'voyage',
      batchSize: 20,
      useCache: true,
    },
  },
};

// Development configuration
const developmentConfig = {
  extraction: {
    circuitBreaker: { enabled: false },
    retry: { maxAttempts: 1 },
  },
};
```

### Health Checks

```typescript
app.get('/health', async (c) => {
  const health = {
    status: 'healthy',
    services: {
      extractor: await extractorService.healthCheck(),
      processor: await processorService.healthCheck(),
      previewer: await previewService.healthCheck(),
      orchestrator: await orchestrator.healthCheck(),
    },
    timestamp: new Date().toISOString(),
  };

  const allHealthy = Object.values(health.services).every(s => s);
  return c.json(health, allHealthy ? 200 : 503);
});
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  // Stop accepting new requests
  await server.close();

  // Cleanup services
  await orchestrator.cleanup();
  await extractorService.cleanup();
  await processorService.cleanup();
  await previewService.cleanup();

  console.log('Shutdown complete');
  process.exit(0);
});
```

### Monitoring

```typescript
// Metrics collection
app.use(async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;

  metrics.recordHttpRequest({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  });
});

// Performance monitoring
orchestrator.on('document:processed', (data) => {
  metrics.recordProcessing({
    documentId: data.documentId,
    extractionTime: data.metrics.extractionTime,
    processingTime: data.metrics.processingTime,
    previewTime: data.metrics.previewTime,
    totalTime: data.metrics.totalTime,
  });
});
```

---

## Summary

The refactored architecture provides:

1. **Modularity**: Services can be used independently or together
2. **Testability**: Each component can be tested in isolation
3. **Scalability**: Services can be scaled independently
4. **Resilience**: Built-in error handling, retries, and circuit breakers
5. **Observability**: Comprehensive logging and metrics
6. **Maintainability**: Clear responsibilities and interfaces

### Next Steps

- Review [Services Usage Guide](./services-usage.md)
- Read [Migration Guide](./migration-guide.md)
- Explore test examples in test files
- Check API documentation

---

**Questions or Feedback?**

- GitHub Issues for bugs
- Discussions for questions
- PRs for contributions
