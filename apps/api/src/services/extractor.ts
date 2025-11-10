/**
 * Document Extractor Service (Legacy - Backward Compatibility Layer)
 *
 * ⚠️ DEPRECATED: This file is maintained for backward compatibility only.
 * All logic has been delegated to DocumentExtractorService.
 *
 * ✅ New Architecture (Recommended):
 * For new code, use DocumentExtractorService from services/extraction/
 *
 * Example:
 * ```typescript
 * import { createDocumentExtractorService } from './services/extraction';
 *
 * const service = createDocumentExtractorService();
 * await service.initialize();
 * const result = await service.extract({ url, type });
 * ```
 *
 * Migration Path:
 * - Phase 7 (Current): All logic delegated to DocumentExtractorService
 * - Phase 8 (Future): Migrate all callers to use DocumentExtractorService directly
 * - Phase 9 (Future): Remove this file entirely
 *
 * See: docs/migration-guide.md for migration instructions
 */

import { createDocumentExtractorService } from './extraction'
import type { ExtractionInput as NewExtractionInput, ExtractionResult as NewExtractionResult } from './interfaces'

// ============================================================================
// Legacy Type Definitions (for backward compatibility)
// ============================================================================

export type ExtractionInput = {
	originalContent?: string | null
	url?: string | null
	type?: string | null
	metadata?: Record<string, unknown> | null
}

export type ExtractionResult = {
	text: string
	title?: string | null
	source?: string | null
	url?: string | null
	contentType?: string | null
	raw?: Record<string, unknown> | null
	wordCount: number
}

// ============================================================================
// Service Instance (singleton)
// ============================================================================

let extractorServiceInstance: Awaited<ReturnType<typeof createDocumentExtractorService>> | null = null

async function getExtractorService() {
	if (!extractorServiceInstance) {
		extractorServiceInstance = createDocumentExtractorService({
			pdf: {
				enabled: true,
				ocrEnabled: true,
				ocrProvider: 'replicate'
			},
			youtube: {
				enabled: true,
				preferredLanguages: ['en', 'en-US', 'pt', 'pt-BR']
			},
			url: {
				enabled: true
			},
			file: {
				enabled: true,
				markitdownEnabled: true
			},
			repository: {
				enabled: true,
				githubToken: process.env.GITHUB_TOKEN || process.env.GITHUB_API_KEY
			},
			circuitBreaker: {
				enabled: true,
				failureThreshold: 5,
				resetTimeout: 60000
			},
			retry: {
				maxAttempts: 3,
				baseDelay: 1000,
				maxDelay: 30000,
				backoffMultiplier: 2,
				jitter: true
			}
		})

		await extractorServiceInstance.initialize()
		console.log('[extractor.ts] DocumentExtractorService initialized')
	}

	return extractorServiceInstance
}

// ============================================================================
// Type Conversion Utilities
// ============================================================================

function convertLegacyInput(legacyInput: ExtractionInput): NewExtractionInput {
	// Determine type based on input
	let type: 'url' | 'pdf' | 'text' | 'file' | 'repository' = 'text'

	const metadataType = legacyInput.metadata?.type as string | undefined
	if (metadataType === 'repository' || legacyInput.type === 'repository') {
		type = 'repository'
	} else if (legacyInput.url) {
		type = 'url'
	} else if (legacyInput.originalContent) {
		// Check for data URL
		if (legacyInput.originalContent.startsWith('data:')) {
			const mimeMatch = legacyInput.originalContent.match(/^data:([^;]+);/)
			if (mimeMatch?.[1]?.includes('pdf')) {
				type = 'pdf'
			}
		}
	}

	return {
		type,
		url: legacyInput.url || null,
		originalContent: legacyInput.originalContent || null,
		metadata: legacyInput.metadata || undefined
	}
}

function convertToLegacyResult(newResult: NewExtractionResult): ExtractionResult {
	return {
		text: newResult.text,
		title: newResult.title || null,
		source: newResult.source || null,
		url: newResult.url || null,
		contentType: newResult.contentType || null,
		raw: newResult.raw || null,
		wordCount: newResult.wordCount
	}
}

// ============================================================================
// Main Export (delegates to new service)
// ============================================================================

/**
 * Extract document content (Legacy)
 *
 * ⚠️ DEPRECATED: This function delegates to DocumentExtractorService.
 * For new code, use DocumentExtractorService directly.
 *
 * @param input - Legacy extraction input
 * @returns Extraction result
 *
 * @deprecated Use DocumentExtractorService from services/extraction/ instead
 *
 * @example
 * ```typescript
 * // Legacy (still works)
 * import { extractDocumentContent } from './services/extractor';
 * const result = await extractDocumentContent({ url: 'https://example.com' });
 *
 * // New (recommended)
 * import { createDocumentExtractorService } from './services/extraction';
 * const service = createDocumentExtractorService();
 * await service.initialize();
 * const result = await service.extract({ url: 'https://example.com', type: 'url' });
 * ```
 */
export async function extractDocumentContent(
	input: ExtractionInput,
): Promise<ExtractionResult> {
	console.warn(
		'[DEPRECATED] extractDocumentContent() is deprecated. ' +
		'Use DocumentExtractorService from services/extraction/ instead. ' +
		'See docs/migration-guide.md for migration instructions.'
	)

	try {
		// Get service instance
		const service = await getExtractorService()

		// Convert legacy input to new format
		const newInput = convertLegacyInput(input)

		// Delegate to new service
		const newResult = await service.extract(newInput)

		// Convert new result back to legacy format
		return convertToLegacyResult(newResult)
	} catch (error) {
		console.error('[extractor.ts] Extraction failed:', error)
		throw error
	}
}

// ============================================================================
// Re-exports for compatibility
// ============================================================================

export { createDocumentExtractorService } from './extraction'
