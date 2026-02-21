/**
 * Ingestion Pipeline
 *
 * Three functions that replace the IngestionOrchestratorService, DocumentExtractorService,
 * and DocumentProcessorService layers. Each function calls the underlying services directly
 * with a simple retry wrapper.
 *
 * Used by: worker/process-document.ts
 */

import type {
	ExtractionInput,
	ExtractionResult,
	ProcessedDocument,
	ProcessingOptions,
} from "../interfaces/document-processing"
import { withRetry } from "../utils/retry"

// Lazy-loaded service instances
import { FileExtractor } from "../extraction/file-extractor"
import { PDFExtractor } from "../extraction/pdf-extractor"
import { URLExtractor } from "../extraction/url-extractor"
import { YouTubeExtractor } from "../extraction/youtube-extractor"
import { PreviewGeneratorService } from "../preview/preview-generator"
import { ChunkingService } from "../processing/chunking-service"
import { EmbeddingService } from "../processing/embedding-service"
import { MetadataExtractor } from "../processing/metadata-extractor"
import { SummarizationService } from "../processing/summarization-service"
import { TaggingService } from "../processing/tagging-service"

// ============================================================================
// Service Singletons (lazy-initialized)
// ============================================================================

let _extractors: {
	url: URLExtractor
	youtube: YouTubeExtractor
	pdf: PDFExtractor
	file: FileExtractor
} | null = null

let _processors: {
	chunking: ChunkingService
	embedding: EmbeddingService
	summarization: SummarizationService
	tagging: TaggingService
	metadata: MetadataExtractor
} | null = null

let _previewService: PreviewGeneratorService | null = null

async function getExtractors() {
	if (!_extractors) {
		const url = new URLExtractor()
		const youtube = new YouTubeExtractor(["en", "en-US", "pt", "pt-BR"])
		const pdf = new PDFExtractor({ ocrEnabled: true, ocrProvider: "replicate" })
		const file = new FileExtractor(true)

		await Promise.all([
			url.initialize(),
			youtube.initialize(),
			pdf.initialize(),
			file.initialize(),
		])

		_extractors = { url, youtube, pdf, file }
	}
	return _extractors
}

async function getProcessors() {
	if (!_processors) {
		const chunking = new ChunkingService({
			chunkSize: 800,
			chunkOverlap: 200,
			respectSentences: true,
			respectParagraphs: true,
		})
		const embedding = new EmbeddingService({
			provider: "hybrid",
			batchSize: 10,
			useCache: true,
		})
		const summarization = new SummarizationService({
			provider: "openrouter",
			maxWords: 500,
			style: "paragraph",
		})
		const tagging = new TaggingService({
			maxTags: 6,
			provider: "openrouter",
		})
		const metadata = new MetadataExtractor()

		await Promise.all([
			chunking.initialize(),
			embedding.initialize(),
			summarization.initialize(),
			tagging.initialize(),
			metadata.initialize(),
		])

		_processors = { chunking, embedding, summarization, tagging, metadata }
	}
	return _processors
}

function getPreviewService() {
	if (!_previewService) {
		_previewService = new PreviewGeneratorService({
			enableImageExtraction: true,
			enableFaviconExtraction: false,
			fallbackChain: ["image"],
			timeout: 15000,
			strategyTimeout: 5000,
		})
	}
	return _previewService
}

/**
 * Initialize all pipeline services. Call once at startup.
 */
export async function initializePipeline(): Promise<void> {
	await getExtractors()
	await getProcessors()
	const preview = getPreviewService()
	await preview.initialize()
}

// ============================================================================
// extractDocument()
// ============================================================================

/**
 * Select the best extractor for the input and run extraction with retry.
 * Returns ExtractionResult with text, title, metadata, images, etc.
 */
export async function extractDocument(
	input: ExtractionInput,
): Promise<ExtractionResult> {
	const extractors = await getExtractors()

	// Build ordered list of extractors that can handle this input
	const candidates: Array<{
		name: string
		extractor: { canHandle: (i: ExtractionInput) => boolean; extract: (i: ExtractionInput) => Promise<ExtractionResult>; getPriority: () => number }
	}> = []

	for (const [name, extractor] of Object.entries(extractors)) {
		try {
			if (extractor.canHandle(input)) {
				candidates.push({ name, extractor: extractor as any })
			}
		} catch {
			// Skip extractors that fail canHandle
		}
	}

	// Sort by priority (highest first)
	candidates.sort((a, b) => b.extractor.getPriority() - a.extractor.getPriority())

	if (candidates.length === 0) {
		throw new Error("No suitable extractor found for this input")
	}

	// Try each extractor with retry, fall back to next on failure
	const errors: string[] = []
	for (const { name, extractor } of candidates) {
		try {
			const result = await withRetry(
				() => extractor.extract(input),
				{ maxAttempts: 3, baseDelay: 1000, maxDelay: 15000 },
			)
			return result
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error)
			errors.push(`${name}: ${msg}`)
			console.warn(`[pipeline] Extractor ${name} failed: ${msg}`)
		}
	}

	throw new Error(
		`All extractors failed. Attempted: ${errors.join("; ")}`,
	)
}

// ============================================================================
// processExtraction()
// ============================================================================

/**
 * Run the processing pipeline: chunk → embed → summarize → tag → metadata.
 * Returns ProcessedDocument with chunks, summary, tags, metadata.
 */
export async function processExtraction(
	extraction: ExtractionResult,
	options?: ProcessingOptions,
): Promise<ProcessedDocument> {
	const procs = await getProcessors()

	// Step 1: Chunking
	const chunks = await procs.chunking.chunk(extraction.text, {
		chunkSize: options?.chunkSize,
		chunkOverlap: options?.chunkOverlap,
		respectSentences: options?.respectSentences,
		respectParagraphs: options?.respectParagraphs,
	})

	// Step 2: Generate embeddings
	const chunksWithEmbeddings = await procs.embedding.generateEmbeddings(chunks)

	// Step 3: Generate summary (non-critical)
	let summary: string | undefined
	if (!options?.skipSummary) {
		try {
			const result = await procs.summarization.summarizeExtraction(extraction)
			summary = result.summary
		} catch (error) {
			console.warn("[pipeline] Summarization failed, using fallback", {
				error: error instanceof Error ? error.message : String(error),
			})
			// Fallback: first few sentences
			const sentences = extraction.text
				.split(/[.!?]+/)
				.map((s) => s.trim())
				.filter((s) => s.length > 20)
			summary = sentences.length > 0
				? `${sentences.slice(0, 3).join(". ")}.`
				: "No summary available."
		}
	}

	// Step 4: Generate tags (non-critical)
	let tags: string[] = []
	if (!options?.skipTags) {
		try {
			const result = await procs.tagging.generateTagsFromExtraction(extraction)
			tags = result.tags
		} catch (error) {
			console.warn("[pipeline] Tagging failed", {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	// Step 5: Extract metadata (non-critical)
	let extractedMetadata: Record<string, unknown> | undefined
	if (!options?.skipMetadata) {
		try {
			const result = await procs.metadata.extract(extraction)
			extractedMetadata = result as unknown as Record<string, unknown>
		} catch (error) {
			console.warn("[pipeline] Metadata extraction failed", {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	return {
		content: extraction.text,
		chunks: chunksWithEmbeddings,
		summary: summary ?? "",
		tags,
		metadata: {
			extractionResult: extraction,
			processingDate: new Date(),
			processingTime: 0,
			chunkCount: chunksWithEmbeddings.length,
			embeddingDimensions: procs.embedding.getEmbeddingDimensions?.() || 0,
			extracted: extractedMetadata,
		},
	}
}

// ============================================================================
// generatePreview()
// ============================================================================

/**
 * Generate a preview image for the document.
 * Returns preview URL or null.
 */
export async function generatePreview(input: {
	title: string
	text: string
	url: string | null
	source: string
	contentType: string
	metadata: Record<string, unknown>
}): Promise<{ url: string; source: string; type: string } | null> {
	try {
		const svc = getPreviewService()
		const result = await svc.generate(input as any)
		return result
	} catch (error) {
		console.warn("[pipeline] Preview generation failed", {
			error: error instanceof Error ? error.message : String(error),
		})
		return null
	}
}
