export const ENHANCED_SYSTEM_PROMPT = `You are Supermemory Assistant, a knowledgeable AI with access to the user's personal knowledge base.

## How to Access Information
You have access to the "searchDatabase" tool that searches through the user's saved documents, notes, and memories.

**When to use searchDatabase:**
- When the user asks about their documents, memories, or saved content
- When answering questions that require knowledge from their knowledge base
- When the user wants to know what information they have on a specific topic
- When listing, finding, or exploring their saved content

**How to use search results:**
The searchDatabase tool returns JSON with:
- count: total number of results found
- results: array of documents with title, content, summary, type, url, score, chunks, metadata

When presenting results:
1. Extract and present the key information clearly
2. Use the document titles, summaries, and relevant chunks
3. Show URLs when available
4. Organize results by relevance (use the score field)
5. If showing multiple documents, group or categorize them logically

## Guidelines
- ALWAYS use searchDatabase when users ask about their memories/documents
- Base answers ONLY on retrieved context - never invent information
- If nothing relevant exists, let the user know and suggest they might want to add that information
- Respond in the same language the user is using
- Be concise but comprehensive - combine multiple sources when helpful
- When showing lists, present them in a clear, organized format`

export const CONDENSE_SYSTEM_PROMPT = `You are a query rewriting assistant. Given a conversation between a user and an assistant and the user's latest follow-up question, rewrite the follow-up into a standalone query that:

1. Preserves the original language, intent, and key entities
2. Expands pronouns or references into explicit nouns when needed
3. Includes relevant specifications or constraints mentioned previously
4. Removes conversational fillers or acknowledgements

Return ONLY the rewritten query without any punctuation or commentary.`

export const FALLBACK_PROMPT = `You are a helpful assistant with access to the user's personal knowledge base.`

export function formatSearchResultsForSystemMessage(
	results: Array<{
		documentId: string
		title: string | null
		summary: string | null
		score: number
		chunks?: Array<{ content: string; score: number }>
		metadata?: Record<string, unknown> | null
	}>,
	options: {
		maxResults?: number
		includeScore?: boolean
		includeSummary?: boolean
		includeChunks?: boolean
		maxChunkLength?: number
	} = {},
) {
	const {
		maxResults = 5,
		includeScore = true,
		includeSummary = true,
		includeChunks = true,
		maxChunkLength = 300,
	} = options

	if (!Array.isArray(results) || results.length === 0) {
		return ""
	}

	const topResults = results.slice(0, maxResults)
	const formatted = topResults.map((result, index) => {
		const lines: string[] = []

		// Document title and score
		const title = result.title || `Document ${result.documentId}`
		const scorePart =
			includeScore && Number.isFinite(result.score)
				? ` (relevance: ${(result.score * 100).toFixed(1)}%)`
				: ""
		lines.push(`[${index + 1}] ${title}${scorePart}`)

		// Source label if available
		const metadata = result.metadata ?? null
		const sourceValue = metadata?.source
		const sourceLabel =
			typeof sourceValue === "string" ? (sourceValue as string) : undefined
		if (sourceLabel) {
			lines.push(`    Source: ${sourceLabel}`)
		}

		// URL if available
		const urlCandidate = metadata?.url ?? metadata?.source_url
		const url =
			typeof urlCandidate === "string" ? (urlCandidate as string) : undefined
		if (url) {
			lines.push(`    URL: ${url}`)
		}

		// Summary if available and requested
		if (includeSummary && result.summary) {
			const summary =
				result.summary.length > 200
					? `${result.summary.slice(0, 197)}...`
					: result.summary
			lines.push(`    Summary: ${summary}`)
		}

		// Relevant chunks if requested
		if (includeChunks && result.chunks?.length > 0) {
			const relevantChunks = result.chunks
				.filter((chunk) => chunk.score > 0.3) // Only include relevant chunks
				.slice(0, 2) // Limit to top 2 chunks

			if (relevantChunks.length > 0) {
				lines.push("    Relevant excerpts:")
				for (const chunk of relevantChunks) {
					const content = chunk.content?.replace(/\s+/g, " ").trim()
					if (!content) continue
					const excerpt =
						content.length > maxChunkLength
							? `${content.slice(0, maxChunkLength - 3)}...`
							: content
					lines.push(`      • ${excerpt}`)
				}
			}
		}

		return lines.join("\n")
	})

	const contextMessage = `## Retrieved Context from Your Knowledge Base:
${formatted.join("\n\n")}

Total documents found: ${results.length}
Showing top ${topResults.length} most relevant results.

Use this context to provide accurate, personalized responses based on the user's saved information.`

	return contextMessage
}

export const QUERY_GENERATION_PROMPT = `Given the user's question, generate 3-5 alternative search queries that could help find relevant information in their knowledge base.

Rules:
1. Each query should explore a different angle or aspect
2. Include both specific and broader queries
3. Consider synonyms and related concepts
4. Keep queries concise (2-7 words typically work best)

Return queries as a JSON array of strings.

User's question: {{QUESTION}}

Example output:
["machine learning basics", "ML fundamentals", "artificial intelligence introduction", "neural networks explained"]`

export const ANSWER_SYNTHESIS_PROMPT = `You are synthesizing information from multiple sources to answer the user's question.

## Available Information:
{{CONTEXT}}

## User's Question:
{{QUESTION}}

## Instructions:
1. Provide a comprehensive answer using the available information
2. Cite specific sources using [Document Title] notation
3. If information conflicts between sources, note the discrepancy
4. If the available information doesn't fully answer the question, mention what's missing
5. Suggest follow-up questions or related topics from the knowledge base

Remember to be accurate, helpful, and make connections between different pieces of information when relevant.`
