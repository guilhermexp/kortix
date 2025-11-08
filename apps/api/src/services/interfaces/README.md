# Document Processing Interfaces

This directory contains comprehensive TypeScript interfaces for the document processing refactor. These interfaces define the contracts between services and ensure proper separation of concerns.

## Overview

The document processing system is organized into five main interface categories:

1. **Core Document Processing** (`document-processing.ts`)
2. **Extraction** (`extraction.ts`)
3. **Processing** (`processing.ts`)
4. **Preview Generation** (`preview.ts`)
5. **Orchestration** (`orchestration.ts`)

## Architecture Principles

### Single Responsibility Principle
Each service has a single, well-defined responsibility:
- **DocumentExtractorService**: Extract raw content from sources
- **DocumentProcessorService**: Process and enrich content
- **PreviewGeneratorService**: Generate visual previews
- **IngestionOrchestratorService**: Orchestrate the complete flow

### Interface Segregation
Interfaces are segregated into specialized contracts:
- Base interfaces for common functionality
- Specialized interfaces for specific extractors/processors
- Clear separation between data types and service contracts

### Dependency Inversion
Services depend on abstractions (interfaces), not concrete implementations:
```typescript
// Good: Depend on interface
class MyService {
  constructor(private extractor: DocumentExtractorService) {}
}

// Bad: Depend on concrete class
class MyService {
  constructor(private extractor: PDFExtractorImpl) {}
}
```

## File Structure

```
interfaces/
├── document-processing.ts    # Core interfaces and data types
├── extraction.ts             # Extraction-specific interfaces
├── processing.ts             # Processing-specific interfaces
├── preview.ts               # Preview generation interfaces
├── orchestration.ts         # Orchestration and workflow interfaces
├── index.ts                 # Central export file
└── README.md               # This file
```

## Core Interfaces

### document-processing.ts

**Key Interfaces:**
- `ExtractionInput` - Input for content extraction
- `ExtractionResult` - Result from extraction
- `Chunk` - Text chunk with embedding
- `ProcessedDocument` - Fully processed document
- `PreviewInput` / `PreviewResult` - Preview generation I/O
- `ProcessDocumentInput` - Complete document processing input
- `ProcessingResult` - Processing outcome

**Service Interfaces:**
- `DocumentExtractorService` - Content extraction service
- `DocumentProcessorService` - Content processing service
- `PreviewGeneratorService` - Preview generation service
- `IngestionOrchestratorService` - Orchestration service
- `BaseService` - Base interface for all services

**Configuration Types:**
- `ExtractorServiceConfig`
- `ProcessorServiceConfig`
- `PreviewServiceConfig`
- `OrchestratorServiceConfig`

### extraction.ts

**Specialized Extractors:**
- `FirecrawlExtractor` - Web content extraction
- `YouTubeExtractor` - YouTube transcript extraction
- `PDFExtractor` - PDF document extraction with OCR
- `FileExtractor` - Office document extraction
- `RepositoryExtractor` - GitHub repository extraction

**Supporting Interfaces:**
- `ExtractorChain` - Fallback chain for extractors
- `ExtractionValidator` - Input validation and sanitization
- `MetaTags` - Web page metadata
- Various options types (FirecrawlOptions, YouTubeOptions, etc.)

### processing.ts

**Processing Services:**
- `ChunkingService` - Text chunking with semantic boundaries
- `EmbeddingService` - Vector embedding generation
- `SummarizationService` - AI-powered summarization
- `TaggingService` - Automatic tag generation
- `DocumentEnrichmentService` - Metadata enrichment

**Supporting Interfaces:**
- `ProcessingPipeline` - Multi-stage processing pipeline
- `ProcessingStage` - Individual processing stage
- `HybridEmbeddingStrategy` - Hybrid embedding approach
- `MultiLevelSummary` - Multi-level document summary
- `Entity`, `Sentiment`, `ReadabilityMetrics` - Enrichment types

### preview.ts

**Preview Services:**
- `ImageExtractor` - Extract images from documents
- `SVGGenerator` - Generate SVG previews
- `FaviconExtractor` - Extract favicons from URLs
- `PreviewCache` - Cache preview results
- `PreviewStorage` - Store generated previews
- `PreviewOptimizer` - Optimize preview images

**Supporting Interfaces:**
- `PreviewGenerationPipeline` - Preview generation with fallbacks
- `PreviewGeneratorStrategy` - Strategy for preview generation
- `ImageMetadata`, `FaviconMetadata` - Preview metadata
- `PreviewMonitor` - Event tracking and metrics

### orchestration.ts

**Orchestration Components:**
- `CircuitBreaker` - Protect against cascading failures
- `RetryHandler` - Automatic retry with exponential backoff
- `JobQueue` - Queue management for async processing
- `WorkflowOrchestrator` - Coordinate complex workflows
- `TransactionManager` - Atomic operations
- `RateLimiter` - Control request rates

**Supporting Interfaces:**
- `Workflow`, `WorkflowStep` - Workflow definition
- `Job`, `JobStatus` - Job queue types
- `CircuitBreakerMetrics` - Circuit breaker statistics
- `OrchestrationMonitor` - Event tracking and metrics

## Usage Examples

### Basic Service Implementation

```typescript
import {
  DocumentExtractorService,
  ExtractionInput,
  ExtractionResult,
  ExtractorServiceConfig,
} from './services/interfaces'

class PDFExtractorImpl implements DocumentExtractor {
  private config: ExtractorServiceConfig

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    // Implementation
  }

  canHandle(input: ExtractionInput): boolean {
    return input.type === 'pdf'
  }

  getPriority(): number {
    return 10
  }

  async validateInput(input: ExtractionInput): Promise<void> {
    // Validation logic
  }

  // BaseService methods
  readonly serviceName = 'PDFExtractor'
  async initialize(): Promise<void> { }
  async healthCheck(): Promise<boolean> { return true }
  async cleanup(): Promise<void> { }
}
```

### Using Extraction with Fallback Chain

```typescript
import {
  ExtractorChain,
  DocumentExtractor,
  ExtractionInput,
} from './services/interfaces'

class ExtractorChainImpl implements ExtractorChain {
  private extractors: DocumentExtractor[] = []

  async execute(input: ExtractionInput) {
    for (const extractor of this.extractors) {
      if (extractor.canHandle(input)) {
        try {
          const result = await extractor.extract(input)
          return {
            result,
            successfulExtractor: extractor.serviceName,
            attemptedExtractors: [extractor.serviceName],
            errors: new Map(),
            executionTime: 0,
          }
        } catch (error) {
          // Try next extractor
          continue
        }
      }
    }
    throw new Error('All extractors failed')
  }
}
```

### Implementing Processing Pipeline

```typescript
import {
  ProcessingPipeline,
  ProcessingStage,
  ProcessingStageData,
  ProcessedDocument,
} from './services/interfaces'

class DocumentProcessingPipelineImpl implements ProcessingPipeline {
  private stages: ProcessingStage[] = []

  async process(extraction, options): Promise<ProcessedDocument> {
    let data: ProcessingStageData = {
      extraction,
      options,
      metadata: new Map(),
    }

    for (const stage of this.stages) {
      if (stage.shouldSkip?.(data)) continue

      try {
        const result = await stage.process(data)
        data = { ...data, ...result.output }
      } catch (error) {
        if (stage.onError) {
          const recovery = await stage.onError(error, data)
          data = { ...data, ...recovery.output }
        } else {
          throw error
        }
      }
    }

    return this.buildProcessedDocument(data)
  }
}
```

### Using Circuit Breaker

```typescript
import { CircuitBreaker } from './services/interfaces'

class ServiceWithCircuitBreaker {
  constructor(private circuitBreaker: CircuitBreaker) {}

  async callExternalService() {
    return this.circuitBreaker.execute(
      async () => {
        // Call external service
        const response = await fetch('https://api.example.com')
        return response.json()
      },
      {
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
      }
    )
  }
}
```

### Implementing Workflow Orchestration

```typescript
import {
  WorkflowOrchestrator,
  Workflow,
  WorkflowStep,
  WorkflowResult,
} from './services/interfaces'

class IngestionWorkflowOrchestratorImpl implements WorkflowOrchestrator {
  async execute(workflow: Workflow): Promise<WorkflowResult> {
    const context = this.createContext(workflow)
    const stepsCompleted: string[] = []
    const stepsFailed: string[] = []
    const errors: ProcessingError[] = []

    for (const step of workflow.steps) {
      try {
        const result = await this.executeStep(step, context)
        if (result.success) {
          stepsCompleted.push(step.id)
          context.results.set(step.id, result.output)
        } else {
          stepsFailed.push(step.id)
          errors.push(result.error!)
          if (workflow.options?.stopOnError) break
        }
      } catch (error) {
        stepsFailed.push(step.id)
        errors.push(this.convertError(error))
        if (workflow.options?.stopOnError) break
      }
    }

    return {
      workflowId: workflow.id,
      success: stepsFailed.length === 0,
      stepsCompleted,
      stepsFailed,
      duration: Date.now() - context.startTime.getTime(),
      errors,
    }
  }
}
```

## Testing

### Mocking Services

```typescript
import { DocumentExtractorService } from './services/interfaces'

const mockExtractor: DocumentExtractorService = {
  serviceName: 'MockExtractor',

  async extract(input) {
    return {
      text: 'mocked content',
      title: 'Mock Document',
      source: 'mock',
      url: input.url,
      contentType: 'text/plain',
      raw: null,
      wordCount: 2,
    }
  },

  async extractFromUrl(url) {
    return this.extract({ url })
  },

  async extractFromFile(file, fileName, mimeType) {
    return this.extract({ fileName, mimeType })
  },

  // ... implement other methods
}

// Use in tests
describe('MyService', () => {
  it('should process document', async () => {
    const service = new MyService(mockExtractor)
    const result = await service.process(input)
    expect(result).toBeDefined()
  })
})
```

## Design Patterns

### Strategy Pattern
Different extractors implement the same interface, allowing runtime selection:
```typescript
const extractor = isYouTube(url)
  ? youtubeExtractor
  : isPDF(file)
    ? pdfExtractor
    : firecrawlExtractor
```

### Chain of Responsibility
Extractor chain tries each extractor until one succeeds:
```typescript
const result = await extractorChain.execute(input)
```

### Circuit Breaker Pattern
Protect services from cascading failures:
```typescript
await circuitBreaker.execute(() => externalServiceCall())
```

### Observer Pattern
Monitor events throughout the system:
```typescript
monitor.subscribe(event => {
  console.log('Event:', event.type)
})
```

## Best Practices

### 1. Always Use Interfaces
```typescript
// Good
function processDocument(extractor: DocumentExtractorService) {}

// Bad
function processDocument(extractor: PDFExtractorImpl) {}
```

### 2. Validate Input
```typescript
async extract(input: ExtractionInput): Promise<ExtractionResult> {
  await this.validateInput(input)
  // ... extraction logic
}
```

### 3. Handle Errors Gracefully
```typescript
try {
  return await primaryExtractor.extract(input)
} catch (error) {
  console.warn('Primary extractor failed, trying fallback')
  return await fallbackExtractor.extract(input)
}
```

### 4. Use Configuration Objects
```typescript
// Good - flexible and extensible
const config: ExtractorServiceConfig = {
  pdf: { enabled: true, ocrEnabled: true },
  youtube: { enabled: true, preferredLanguages: ['en'] },
}

// Bad - too many parameters
function configure(pdfEnabled, ocrEnabled, youtubeEnabled, languages) {}
```

### 5. Implement Health Checks
```typescript
async healthCheck(): Promise<boolean> {
  try {
    // Check dependencies, connections, etc.
    return true
  } catch {
    return false
  }
}
```

## Migration Guide

When migrating existing code to use these interfaces:

1. **Identify Service Boundaries**
   - What does this service do?
   - What are its inputs and outputs?
   - What other services does it depend on?

2. **Create Implementation**
   - Implement the appropriate interface
   - Move existing logic into interface methods
   - Add validation and error handling

3. **Add Tests**
   - Unit tests for each method
   - Integration tests for service interactions
   - Mock external dependencies

4. **Update Callers**
   - Change to use interfaces instead of concrete classes
   - Update import statements
   - Verify type safety

5. **Document**
   - Add JSDoc comments
   - Document configuration options
   - Provide usage examples

## Versioning

These interfaces follow semantic versioning:
- **Major**: Breaking changes to interfaces
- **Minor**: New optional methods or properties
- **Patch**: Documentation updates, bug fixes

Current Version: **1.0.0** (Initial release)

## Contributing

When adding new interfaces:

1. Place in the appropriate file (extraction, processing, preview, orchestration)
2. Add comprehensive JSDoc comments
3. Export from `index.ts`
4. Add usage examples to this README
5. Update the changelog

## Questions?

Refer to:
- Design document: `ai_specs/document-processing-refactor/design.md`
- Requirements: `ai_specs/document-processing-refactor/requirements.md`
- Implementation tasks: `ai_specs/document-processing-refactor/tasks.md`
