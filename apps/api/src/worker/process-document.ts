/**
 * Unified Document Processing
 *
 * Single entry point for processing a document through the complete pipeline:
 * fetch → preview → extract → process → save chunks → update document → clear caches
 *
 * Used by:
 * - ingestion-worker.ts (polling-based)
 * - queue-worker.ts (BullMQ-based)
 * - document-processor-inline.ts (inline/sync)
 */

import { ensureSpace, updateBundleParentStatus } from "../routes/documents"
import {
	extractDocument,
	generatePreview,
	initializePipeline,
	processExtraction,
} from "../services/ingestion/pipeline"
import { documentCache, documentListCache } from "../services/query-cache"
import { getDefaultUserId, supabaseAdmin } from "../supabase"
import { persistPreviewImage } from "../utils/storage"

// ============================================================================
// Initialization
// ============================================================================

/**
 * For workers that eagerly initialize (ingestion-worker, queue-worker),
 * call this at startup so services are ready before jobs arrive.
 */
export async function initializeServices(): Promise<void> {
	await initializePipeline()
}

// ============================================================================
// Helpers
// ============================================================================

function extractYouTubeId(url: string): string | null {
	try {
		const u = new URL(url)
		if (u.hostname.includes("youtube.com")) {
			return u.searchParams.get("v")
		}
		if (u.hostname.includes("youtu.be")) {
			const pathParts = u.pathname.split("/").filter(Boolean)
			return pathParts[0] ?? null
		}
		return null
	} catch {
		return null
	}
}

function toStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null
	const tags = value.filter((item): item is string => typeof item === "string")
	return tags.length > 0 ? tags : null
}

function extractContainerTags(payload: unknown, metadata: unknown): string[] {
	const fromPayload =
		payload && typeof payload === "object"
			? toStringArray((payload as { containerTags?: unknown }).containerTags)
			: null
	const fromMetadata =
		metadata && typeof metadata === "object"
			? toStringArray((metadata as { containerTags?: unknown }).containerTags)
			: null
	return fromPayload ?? fromMetadata ?? ["sm_project_default"]
}

function isYouTubeUrl(url: string | null | undefined): boolean {
	if (!url) return false
	return url.includes("youtube.com") || url.includes("youtu.be")
}

// ============================================================================
// Main processing function
// ============================================================================

export interface ProcessDocumentOptions {
	documentId: string
	jobId: string
	orgId: string
	payload?: unknown
	/** Label for log messages */
	logPrefix?: string
}

/**
 * Process a single document through the complete ingestion pipeline.
 *
 * Steps:
 * 1. Set document status to "processing"
 * 2. Fetch document from database
 * 3. Resolve space, user, container tags
 * 4. Handle tweet-specific raw data
 * 5. Generate preview image (YouTube shortcut or image extraction)
 * 6. Extract content (via pipeline.extractDocument)
 * 7. Process extraction (chunk → embed → summarize → tag)
 * 8. Save chunks to document_chunks
 * 9. Single final update to document row
 * 10. Mark ingestion job as completed
 * 11. Clear caches
 */
export async function processAndSaveDocument(
	options: ProcessDocumentOptions,
): Promise<void> {
	const {
		documentId,
		jobId,
		orgId,
		payload,
		logPrefix = "[process-document]",
	} = options

	console.info(`${logPrefix} Starting`, { documentId, jobId })

	// 1. Mark as processing
	await supabaseAdmin
		.from("documents")
		.update({ status: "processing", updated_at: new Date().toISOString() })
		.eq("id", documentId)

	// 2. Fetch document
	const { data: document, error: docError } = await supabaseAdmin
		.from("documents")
		.select(
			"content, metadata, user_id, title, url, source, type, raw, processing_metadata, parent_id",
		)
		.eq("id", documentId)
		.maybeSingle()

	if (docError) throw docError
	if (!document) throw new Error("Document not found for ingestion job")

	// 3. Resolve space, user, tags
	const containerTags = extractContainerTags(payload, document.metadata)
	const [primaryTag] = containerTags
	const spaceId = await ensureSpace(supabaseAdmin, orgId, primaryTag)
	const userId = document.user_id ?? (await getDefaultUserId())

	// 4. Tweet handling - persist raw tweet JSON and extract preview
	const isTweetWithData =
		document.type === "tweet" &&
		!!(document.metadata as Record<string, unknown>)?.raw_tweet

	if (isTweetWithData) {
		try {
			const rawTweet = JSON.parse(
				(document.metadata as Record<string, unknown>).raw_tweet as string,
			)
			let tweetPreview =
				rawTweet?.photos?.[0]?.url ||
				rawTweet?.user?.profile_image_url_https?.replace(
					"_normal",
					"_400x400",
				) ||
				null
			if (tweetPreview) {
				const stored = await persistPreviewImage(documentId, tweetPreview)
				if (stored) tweetPreview = stored
			}
			await supabaseAdmin
				.from("documents")
				.update({
					raw: { tweet: rawTweet },
					...(tweetPreview ? { preview_image: tweetPreview } : {}),
				})
				.eq("id", documentId)
		} catch (e) {
			console.warn(`${logPrefix} Failed to parse raw_tweet`, {
				documentId,
				error: e,
			})
		}
	}

	// 5. Generate preview
	let previewUrl: string | null = null
	try {
		// YouTube thumbnail shortcut
		if (
			document.url &&
			(document.source === "youtube" || isYouTubeUrl(document.url))
		) {
			const videoId = extractYouTubeId(document.url)
			if (videoId) {
				previewUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
				const stored = await persistPreviewImage(documentId, previewUrl)
				if (stored) previewUrl = stored
			}
		}

		// Fallback to preview service (skip for tweets with raw data)
		if (!previewUrl && document.url && !isTweetWithData) {
			const previewResult = await generatePreview({
				title: document.title || "Untitled",
				text: document.content || "",
				url: document.url,
				source: document.source || "unknown",
				contentType: document.type || "text",
				metadata: (document.metadata as Record<string, unknown>) || {},
			})
			const rawPreviewUrl = previewResult?.url || null
			if (rawPreviewUrl) {
				const stored = await persistPreviewImage(documentId, rawPreviewUrl)
				previewUrl = stored ?? rawPreviewUrl
			}
		}

		if (previewUrl) {
			await supabaseAdmin
				.from("documents")
				.update({ preview_image: previewUrl })
				.eq("id", documentId)
		}
	} catch (previewError) {
		console.warn(`${logPrefix} Preview generation failed`, {
			documentId,
			error:
				previewError instanceof Error
					? previewError.message
					: String(previewError),
		})
	}

	// 6. Extract content
	// For tweets, pass url: null to prevent fetching x.com pages
	const extractionUrl = isTweetWithData ? null : (document.url ?? null)
	const extraction = await extractDocument({
		originalContent: document.content ?? "",
		url: extractionUrl,
		type: document.type ?? null,
		metadata: {
			...(document.metadata as Record<string, unknown>),
			documentId,
			spaceId,
			containerTags,
			jobId,
			jobPayload: payload,
			source: document.source,
			raw: document.raw,
			processingMetadata: document.processing_metadata,
		},
	})

	console.info(`${logPrefix} Extraction complete`, { jobId, documentId })

	// 7. Process extraction (chunk → embed → summarize → tag)
	const processed = await processExtraction(extraction)

	console.info(`${logPrefix} Processing complete`, { jobId, documentId })

	const metaTags =
		(extraction.extractionMetadata as any)?.metaTags ??
		({} as Record<string, any>)

	// 8. Build final document update (single write)
	const finalUpdate: Record<string, unknown> = {
		status: "done",
		error: null,
		updated_at: new Date().toISOString(),
	}

	if (extraction.text) finalUpdate.content = extraction.text
	if (extraction.title) finalUpdate.title = extraction.title
	if (processed.summary) finalUpdate.summary = processed.summary
	// Use preview from earlier step
	if (previewUrl) finalUpdate.preview_image = previewUrl
	// Fallback: use Firecrawl OG image as preview
	if (!finalUpdate.preview_image && metaTags.ogImage) {
		const stored = await persistPreviewImage(documentId, metaTags.ogImage)
		finalUpdate.preview_image = stored ?? metaTags.ogImage
	}
	// Fallback: use first extracted content image as preview
	if (!finalUpdate.preview_image && extraction.images?.length) {
		const firstImg = extraction.images[0]
		if (firstImg) {
			const stored = await persistPreviewImage(documentId, firstImg)
			finalUpdate.preview_image = stored ?? firstImg
		}
	}
	if (extraction.wordCount) finalUpdate.word_count = extraction.wordCount
	if (processed.tags?.length) finalUpdate.tags = processed.tags

	finalUpdate.metadata = {
		...(document.metadata as Record<string, unknown>),
		processingCompleted: true,
		extractedAt: new Date().toISOString(),
		...(extraction.extractionMetadata ?? {}),
		ogImage:
			metaTags.ogImage ?? (extraction.extractionMetadata as any)?.ogImage,
		twitterImage:
			metaTags.twitterImage ??
			(extraction.extractionMetadata as any)?.twitterImage,
		description:
			metaTags.description ??
			(extraction.extractionMetadata as any)?.description,
		favicon:
			metaTags.favicon ?? (extraction.extractionMetadata as any)?.favicon,
		...(processed.tags ? { tags: processed.tags } : {}),
		// Persist first content image so the listing endpoint can use it
		...(extraction.images?.length ? { firstContentImage: extraction.images[0] } : {}),
	}

	if (extraction.raw || extraction.images || metaTags.ogImage) {
		const allImages = [
			...(extraction.images ?? []),
			...(metaTags.ogImage ? [metaTags.ogImage] : []),
			...(metaTags.twitterImage ? [metaTags.twitterImage] : []),
		].filter((v, i, a) => a.indexOf(v) === i)

		finalUpdate.raw = {
			...(extraction.raw ?? {}),
			extraction: {
				images: allImages,
				source: extraction.source,
				contentType: extraction.contentType,
				extractorUsed: extraction.extractorUsed,
				metaTags,
			},
		}
	}

	// 9. Save chunks if available
	if (processed.chunks && processed.chunks.length > 0) {
		const validChunks = processed.chunks.filter(
			(chunk) => chunk.content || (chunk as any).text,
		)
		const documentChunks = validChunks.map((chunk, index) => {
			const chunkContent = chunk.content || (chunk as any).text || ""
			return {
				document_id: documentId,
				org_id: orgId,
				content: chunkContent,
				embedding: chunk.embedding,
				chunk_index: chunk.position ?? (chunk as any).index ?? index,
				token_count:
					(chunk as any).tokenCount ?? Math.ceil(chunkContent.length / 4),
				embedding_model: "voyage-3-large",
				metadata: chunk.metadata ?? {},
				created_at: new Date().toISOString(),
			}
		})

		const { error: chunksError } = await supabaseAdmin
			.from("document_chunks")
			.insert(documentChunks)

		if (chunksError) {
			console.error(`${logPrefix} Failed to save chunks`, {
				documentId,
				error: chunksError.message,
			})
			finalUpdate.status = "failed"
			finalUpdate.error = `Failed to save chunks: ${chunksError.message}`
		} else {
			finalUpdate.chunk_count = documentChunks.length
		}
	}

	// 10. Single final update to document
	await supabaseAdmin.from("documents").update(finalUpdate).eq("id", documentId)

	// 11. Mark ingestion job as completed
	await supabaseAdmin
		.from("ingestion_jobs")
		.update({ status: "completed", completed_at: new Date().toISOString() })
		.eq("id", jobId)

	// 12. Clear caches
	documentListCache.clear()
	documentCache.delete(documentId)

	// 13. Update parent bundle status if this is a child document
	if (document.parent_id) {
		try {
			await updateBundleParentStatus(supabaseAdmin, document.parent_id, orgId)
			console.info(`${logPrefix} Updated parent bundle status`, {
				parentId: document.parent_id,
			})
		} catch (parentError) {
			console.warn(`${logPrefix} Failed to update parent bundle status`, {
				parentId: document.parent_id,
				error:
					parentError instanceof Error
						? parentError.message
						: String(parentError),
			})
		}
	}

	console.info(`${logPrefix} Done`, {
		documentId,
		jobId,
		status: finalUpdate.status,
	})
}
