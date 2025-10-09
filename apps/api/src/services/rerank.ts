import { CohereClient } from "cohere-ai";
import { env } from "../env";

const cohereClient = env.COHERE_API_KEY
  ? new CohereClient({
      token: env.COHERE_API_KEY,
    })
  : null;

export interface RerankDocument {
  id: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface RerankResult {
  index: number;
  relevance_score: number;
}

/**
 * Re-rank documents using Cohere's rerank-v3.5 model
 * Returns indices of documents in order of relevance
 */
export async function rerankDocuments(
  query: string,
  documents: RerankDocument[],
  options: {
    model?: string;
    topN?: number;
    returnDocuments?: boolean;
  } = {},
): Promise<RerankResult[]> {
  if (!cohereClient) {
    // If no Cohere client, return original order
    return documents.map((_, index) => ({
      index,
      relevance_score: 1 - index / documents.length,
    }));
  }

  const model = options.model ?? "rerank-v3.5";
  const topN = options.topN ?? documents.length;

  try {
    const response = await cohereClient.v2.rerank({
      documents: documents.map((doc) => doc.text),
      query,
      model,
      topN,
    });

    return response.results.map((result) => ({
      index: result.index,
      relevance_score: result.relevanceScore,
    }));
  } catch (error) {
    console.error("Cohere reranking failed:", error);
    // Fallback to original order
    return documents.map((_, index) => ({
      index,
      relevance_score: 1 - index / documents.length,
    }));
  }
}

/**
 * Re-rank search results to improve relevance
 */
export async function rerankSearchResults(
  query: string,
  results: Array<{
    documentId: string;
    title: string | null;
    summary: string | null;
    content: string | null;
    chunks: Array<{ content: string; score: number }>;
    score: number;
    [key: string]: any;
  }>,
  options: {
    useTitle?: boolean;
    useSummary?: boolean;
    useContent?: boolean;
    useChunks?: boolean;
    maxLength?: number;
  } = {},
): Promise<typeof results> {
  if (!cohereClient || results.length === 0) {
    return results;
  }

  const {
    useTitle = true,
    useSummary = true,
    useContent = false,
    useChunks = true,
    maxLength = 512,
  } = options;

  // Prepare documents for reranking
  const documents: RerankDocument[] = results.map((result) => {
    const parts: string[] = [];

    if (useTitle && result.title) {
      parts.push(`Title: ${result.title}`);
    }

    if (useSummary && result.summary) {
      parts.push(`Summary: ${result.summary.slice(0, maxLength)}`);
    }

    if (useContent && result.content) {
      parts.push(`Content: ${result.content.slice(0, maxLength)}`);
    }

    if (useChunks && result.chunks.length > 0) {
      const topChunk = result.chunks[0];
      parts.push(`Relevant excerpt: ${topChunk.content.slice(0, maxLength)}`);
    }

    return {
      id: result.documentId,
      text: parts.join("\n\n"),
      metadata: {
        originalScore: result.score,
        title: result.title,
      },
    };
  });

  // Rerank the documents
  const rerankedIndices = await rerankDocuments(query, documents, {
    topN: results.length,
  });

  // Sort results based on reranked order
  const rerankedResults = rerankedIndices.map(({ index, relevance_score }) => ({
    ...results[index],
    score: relevance_score, // Update score with Cohere's relevance score
    originalScore: results[index].score, // Keep original score for reference
  }));

  return rerankedResults;
}
