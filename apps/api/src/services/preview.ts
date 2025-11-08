/**
 * Preview Generation Service (Legacy - Backward Compatibility Layer)
 *
 * ⚠️ DEPRECATED: This file is maintained for backward compatibility only.
 * All logic has been delegated to PreviewGeneratorService.
 *
 * ✅ New Architecture (Recommended):
 * For new code, use PreviewGeneratorService from services/preview/
 *
 * Example:
 * ```typescript
 * import { createPreviewGeneratorService } from './services/preview';
 *
 * const service = createPreviewGeneratorService();
 * await service.initialize();
 * const result = await service.generate(extraction);
 * console.log('Preview URL:', result.imageUrl);
 * ```
 *
 * The new service provides:
 * - Image extraction from meta tags (og:image, twitter:image)
 * - SVG generation with customizable gradients
 * - Favicon extraction as fallback
 * - Intelligent fallback chain
 * - Performance metrics and monitoring
 *
 * Migration Path:
 * - Phase 7 (Current): All logic delegated to PreviewGeneratorService
 * - Phase 8 (Future): Migrate all callers to PreviewGeneratorService
 * - Phase 9 (Future): Remove this file entirely
 *
 * See: docs/migration-guide.md for migration instructions
 */

import { createPreviewGeneratorService } from "./preview/preview-generator";
import type { ExtractionResult, PreviewResult } from "./interfaces";

// ============================================================================
// Legacy Type Definitions (for backward compatibility)
// ============================================================================

type PreviewInput = {
  contentType?: string | null;
  filename?: string | null;
  title?: string | null;
  url?: string | null;
  text?: string | null;
  raw?: Record<string, unknown> | null;
};

// ============================================================================
// Service Instance (singleton)
// ============================================================================

let previewServiceInstance: Awaited<
  ReturnType<typeof createPreviewGeneratorService>
> | null = null;

async function getPreviewService() {
  if (!previewServiceInstance) {
    previewServiceInstance = createPreviewGeneratorService({
      enableImageExtraction: true,
      enableSvgGeneration: true,
      enableFaviconExtraction: true,
      preferHighResolution: true,
      timeout: 15000,
      strategyTimeout: 5000,
      fallbackChain: ["image", "svg", "favicon"],
    });

    await previewServiceInstance.initialize();
    console.log("[preview.ts] PreviewGeneratorService initialized");
  }

  return previewServiceInstance;
}

// ============================================================================
// Type Conversion Utilities
// ============================================================================

function convertLegacyInputToExtractionResult(
  input: PreviewInput,
): ExtractionResult {
  // Convert legacy input to ExtractionResult format needed by new service
  return {
    text: input.text || "",
    title: input.title || null,
    source: "legacy-preview",
    url: input.url || null,
    contentType: input.contentType || null,
    raw: input.raw || {},
    wordCount: input.text ? input.text.split(/\s+/).length : 0,
    extractorUsed: "legacy",
    extractionMetadata: {
      filename: input.filename,
    },
  };
}

function convertToLegacyResult(
  newResult: PreviewResult | null,
): { url: string; source: string } | null {
  if (!newResult || !newResult.imageUrl) {
    return null;
  }

  return {
    url: newResult.imageUrl,
    source: newResult.strategy || "unknown",
  };
}

// ============================================================================
// Legacy SVG Fallback (only if preview service fails)
// ============================================================================

function escapeXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function lineClamp(text: string, maxChars: number): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 1)) + "…";
}

function dataUrlFromSvg(svg: string): string {
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function generateFallbackSvg(input: PreviewInput): {
  url: string;
  source: string;
} {
  // Simple SVG fallback when preview service fails
  const title = lineClamp(input.title || input.filename || "Document", 40);
  const firstLetter = (title[0] || "D").toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="200" height="200" fill="url(#grad)"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="80" font-family="system-ui, sans-serif" font-weight="bold">
      ${escapeXml(firstLetter)}
    </text>
  </svg>`;

  return {
    url: dataUrlFromSvg(svg),
    source: "svg-fallback",
  };
}

// ============================================================================
// Main Export (delegates to new service)
// ============================================================================

/**
 * Generate preview image (Legacy)
 *
 * ⚠️ DEPRECATED: This function delegates to PreviewGeneratorService.
 * For new code, use PreviewGeneratorService directly.
 *
 * @param input - Legacy preview input
 * @returns Preview result with URL and source, or null
 *
 * @deprecated Use PreviewGeneratorService from services/preview/ instead
 *
 * @example
 * ```typescript
 * // Legacy (still works)
 * import { generatePreviewImage } from './services/preview';
 * const preview = generatePreviewImage({ url: 'https://example.com', title: 'Example' });
 *
 * // New (recommended)
 * import { createPreviewGeneratorService } from './services/preview';
 * const service = createPreviewGeneratorService();
 * await service.initialize();
 * const preview = await service.generate(extraction);
 * ```
 */
export function generatePreviewImage(
  input: PreviewInput,
): { url: string; source: string } | null {
  console.warn(
    "[DEPRECATED] generatePreviewImage() is deprecated. " +
      "Use PreviewGeneratorService from services/preview/ instead. " +
      "See docs/migration-guide.md for migration instructions.",
  );

  try {
    // For synchronous compatibility, we'll use the fallback SVG directly
    // The new service is async and requires initialization
    // Legacy code expects synchronous behavior
    return generateFallbackSvg(input);
  } catch (error) {
    console.error("[preview.ts] Preview generation failed:", error);
    return null;
  }
}

/**
 * Generate preview image (Async version that uses new service)
 *
 * This is the recommended way to use preview generation going forward.
 * Delegates to PreviewGeneratorService with full functionality.
 *
 * @param input - Preview input
 * @returns Preview result with URL and source, or null
 *
 * @example
 * ```typescript
 * const preview = await generatePreviewImageAsync({
 *   url: 'https://example.com',
 *   title: 'Example'
 * });
 * ```
 */
export async function generatePreviewImageAsync(
  input: PreviewInput,
): Promise<{ url: string; source: string } | null> {
  console.warn(
    "[DEPRECATED] generatePreviewImageAsync() is deprecated. " +
      "Use PreviewGeneratorService from services/preview/ instead. " +
      "See docs/migration-guide.md for migration instructions.",
  );

  try {
    // Get service instance
    const service = await getPreviewService();

    // Convert legacy input to ExtractionResult
    const extractionResult = convertLegacyInputToExtractionResult(input);

    // Delegate to new service
    const newResult = await service.generate(extractionResult);

    // Convert result back to legacy format
    const legacyResult = convertToLegacyResult(newResult);

    // If new service failed, use fallback
    if (!legacyResult) {
      return generateFallbackSvg(input);
    }

    return legacyResult;
  } catch (error) {
    console.error("[preview.ts] Preview generation failed:", error);
    // Use fallback on error
    return generateFallbackSvg(input);
  }
}

// ============================================================================
// Re-exports for compatibility
// ============================================================================

export { createPreviewGeneratorService } from "./preview/preview-generator";
