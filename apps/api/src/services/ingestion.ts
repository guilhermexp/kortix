import { env } from "../env"
import { supabaseAdmin } from "../supabase"
import { chunkText } from "./chunk"
import { generateDeterministicEmbedding } from "./embedding"
import {
	generateEmbedding,
	generateEmbeddingsBatch,
} from "./embedding-provider"
import { extractDocumentContent } from "./extractor"
import { generateDeepAnalysis } from "./summarizer"

export type JsonRecord = Record<string, unknown>

export type ProcessDocumentInput = {
	documentId: string
	organizationId: string
	userId: string
	spaceId: string
	containerTags: string[]
	jobId?: string
	document: {
		content: string | null
		metadata: JsonRecord | null
		title: string | null
		url: string | null
		source: string | null
		type: string | null
		raw: JsonRecord | null
		processingMetadata: JsonRecord | null
	}
	jobPayload: JsonRecord | null
}

async function updateDocumentStatus(
	documentId: string,
	status: string,
	extra?: JsonRecord,
) {
	const { error } = await supabaseAdmin
		.from("documents")
		.update({ status, ...(extra ?? {}) })
		.eq("id", documentId)

	if (error) throw error
}

async function updateJobStatus(
	jobId: string,
	status: string,
	errorMessage?: string,
) {
	const { error } = await supabaseAdmin
		.from("ingestion_jobs")
		.update({ status, error_message: errorMessage ?? null })
		.eq("id", jobId)

	if (error) throw error
}

function mergeMetadata(
	existing: JsonRecord | null,
	incoming: JsonRecord | null,
	extras: JsonRecord,
): JsonRecord | null {
	const result: JsonRecord = {
		...(existing ?? {}),
		...(incoming ?? {}),
	}

	for (const [key, value] of Object.entries(extras)) {
		if (value !== undefined) {
			result[key] = value
		}
	}

	return Object.keys(result).length > 0 ? result : null
}

function mergeProcessingMetadata(
	existing: JsonRecord | null,
	extras: JsonRecord,
): JsonRecord | null {
	const next = {
		...(existing ?? {}),
		...extras,
	}
	return Object.keys(next).length > 0 ? next : null
}

function estimateTokenCount(wordCount: number): number {
	if (wordCount <= 0) return 0
	return Math.round(wordCount * 1.3)
}

export async function processDocument(input: ProcessDocumentInput) {
	const {
		documentId,
		organizationId,
		userId,
		spaceId,
		containerTags,
		jobId,
		document,
		jobPayload,
	} = input

	const payloadMetadata =
		(jobPayload?.metadata as JsonRecord | undefined) ?? null
	const payloadUrl = (jobPayload?.url as string | undefined) ?? null
	const payloadType = (jobPayload?.type as string | undefined) ?? null
	const originalContent =
		(jobPayload?.content as string | undefined) ?? document.content ?? ""

	try {
		if (jobId) {
			await updateJobStatus(jobId, "processing")
		}

		await updateDocumentStatus(documentId, "fetching")

		const extraction = await extractDocumentContent({
			originalContent,
			url: payloadUrl ?? document.url ?? null,
			type: payloadType ?? document.type ?? null,
			metadata: payloadMetadata ?? document.metadata ?? null,
		})

		await updateDocumentStatus(documentId, "extracting")

        const mergedMetadata = mergeMetadata(document.metadata, payloadMetadata, {
            // Ensure documents carry containerTags for project scoping and fallbacks
            containerTags,
            extraction: {
                contentType: extraction.contentType,
                wordCount: extraction.wordCount,
                fetchedAt: new Date().toISOString(),
            },
            source:
                extraction.source ?? document.source ?? jobPayload?.source ?? null,
            originalUrl: extraction.url ?? document.url ?? payloadUrl ?? null,
        })

		const processingMetadata = mergeProcessingMetadata(
			document.processingMetadata,
			{
				extraction: {
					status: "done",
					contentType: extraction.contentType,
					wordCount: extraction.wordCount,
				},
			},
		)

		const mergedRaw = extraction.raw
			? {
					...(document.raw ?? {}),
					extraction: extraction.raw,
				}
			: (document.raw ?? null)

		const summary = await generateDeepAnalysis(extraction.text, {
			title: extraction.title ?? document.title ?? null,
			url: extraction.url ?? document.url ?? payloadUrl ?? null,
			contentType: extraction.contentType ?? null,
		})

		const chunks = chunkText(extraction.text)
		await updateDocumentStatus(documentId, "chunking")

		const chunkEmbeddings =
			chunks.length > 0
				? await generateEmbeddingsBatch(chunks.map((chunk) => chunk.content))
				: []

		const chunkRows = chunks.map((chunk, index) => ({
			document_id: documentId,
			org_id: organizationId,
			content: chunk.content,
			type: "text",
			position: chunk.position,
			metadata: {
				position: chunk.position,
				containerTags,
				source: extraction.source ?? document.source ?? null,
			},
			embedding:
				chunkEmbeddings[index] ?? generateDeterministicEmbedding(chunk.content),
			embedding_model: env.EMBEDDING_MODEL,
		}))

		if (chunkRows.length > 0) {
			const { error: chunkError } = await supabaseAdmin
				.from("document_chunks")
				.insert(chunkRows)
			if (chunkError) throw chunkError
		}

		await updateDocumentStatus(documentId, "embedding")

		const documentEmbedding = await generateEmbedding(extraction.text)

		const { error: documentUpdateError } = await supabaseAdmin
			.from("documents")
			.update({
				status: "done",
				title: extraction.title ?? document.title ?? null,
				content: extraction.text,
				url: extraction.url ?? document.url ?? null,
				source: extraction.source ?? document.source ?? null,
				metadata: mergedMetadata,
				processing_metadata: processingMetadata,
				raw: mergedRaw,
				summary: summary ?? null,
				word_count: extraction.wordCount,
				token_count: estimateTokenCount(extraction.wordCount),
				summary_embedding: documentEmbedding,
				summary_embedding_model: env.EMBEDDING_MODEL,
				chunk_count: chunkRows.length,
				average_chunk_size:
					chunkRows.length > 0
						? Math.round(extraction.text.length / chunkRows.length)
						: extraction.text.length,
			})
			.eq("id", documentId)

		if (documentUpdateError) throw documentUpdateError

		const { error: memoryError } = await supabaseAdmin.from("memories").insert({
			document_id: documentId,
			space_id: spaceId,
			org_id: organizationId,
			user_id: userId,
			content: extraction.text,
			metadata: mergedMetadata,
			memory_embedding: documentEmbedding,
			memory_embedding_model: env.EMBEDDING_MODEL,
		})

		if (memoryError) throw memoryError

		if (jobId) {
			await updateJobStatus(jobId, "done")
		}

		return {
			status: "done" as const,
			chunkCount: chunkRows.length,
		}
	} catch (error) {
		console.error("Failed to process document", error)
		if (jobId) {
			await updateJobStatus(
				jobId,
				"failed",
				error instanceof Error ? error.message : String(error),
			)
		}
		await updateDocumentStatus(documentId, "failed", {
			processing_metadata: {
				...(input.document.processingMetadata ?? {}),
				error: error instanceof Error ? error.message : String(error),
			},
		})
		throw error
	}
}
