/**
 * Related Links Pipeline
 *
 * Extracts mentions of apps, repositories, tools, frameworks from document content
 * and searches for their official links using Exa API.
 */

import { env } from "../env"
import { searchWebWithExa } from "./exa-search"
import { openRouterChat } from "./openrouter"

export type RelatedLink = {
	title: string
	url: string
	image?: string | null
	favicon?: string | null
	snippet?: string | null
	type: "repository" | "tool" | "framework" | "website" | "video" | "article"
	mentionedAs: string // Original mention from content
	isAlternative?: boolean // True if this is an alternative to a mentioned tool
}

export type ExtractedMention = {
	name: string
	type: "repository" | "tool" | "framework" | "website" | "video" | "article"
	context?: string
}

const EXTRACTION_PROMPT = `You are an expert at identifying and extracting mentions of external resources from content.

Analyze the following content and extract ALL mentions of:
- GitHub repositories or open source projects
- Tools, apps, or software products
- Frameworks or libraries
- Websites or online services
- YouTube videos or channels
- Articles or blog posts

For each mention, provide:
1. The exact name as mentioned
2. The type (repository, tool, framework, website, video, article)
3. Brief context of how it was mentioned (optional)

IMPORTANT:
- Only extract explicitly mentioned resources, don't infer or guess
- Include the exact name as written in the content
- Maximum 15 mentions to avoid overwhelming results
- Focus on unique, identifiable resources that can be searched

Respond ONLY with a valid JSON array, no markdown, no explanation:
[
  {"name": "LangChain", "type": "framework", "context": "mentioned as alternative"},
  {"name": "Ollama", "type": "tool", "context": "recommended for local LLM"}
]

If no relevant mentions found, respond with: []`

/**
 * Extract mentions of external resources from content using AI
 */
export async function extractMentionsFromContent(
	content: string,
	options?: { maxMentions?: number },
): Promise<ExtractedMention[]> {
	if (!content?.trim()) return []

	// Limit content to avoid token limits
	const truncated = content.slice(0, 8000)

	try {
		const response = await openRouterChat(
			[
				{ role: "system", content: EXTRACTION_PROMPT },
				{ role: "user", content: truncated },
			],
			{
				model: "x-ai/grok-4-fast", // Fast model for quick extraction
				temperature: 0.1,
				maxTokens: 1024,
			},
		)

		if (!response) return []

		// Parse JSON response
		const cleaned = response
			.replace(/```json\n?/g, "")
			.replace(/```\n?/g, "")
			.trim()

		const parsed = JSON.parse(cleaned) as ExtractedMention[]

		if (!Array.isArray(parsed)) return []

		// Validate and limit
		const maxMentions = options?.maxMentions ?? 15
		return parsed
			.filter(
				(m) =>
					m &&
					typeof m.name === "string" &&
					m.name.trim().length > 0 &&
					typeof m.type === "string",
			)
			.slice(0, maxMentions)
	} catch (error) {
		console.warn("[RelatedLinks] Failed to extract mentions:", error)
		return []
	}
}

/**
 * Search for alternatives to a tool/framework
 * DISABLED - was returning listicle pages instead of actual tools
 */
async function searchForAlternatives(
	_mention: ExtractedMention,
): Promise<RelatedLink[]> {
	// Disabled for now - the search was returning aggregator sites
	// instead of actual alternative tools
	return []
}

/**
 * Get preview image for a URL using Microlink (free screenshot service)
 */
async function getPreviewImage(url: string): Promise<string | null> {
	try {
		const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`
		const response = await fetch(microlinkUrl, {
			headers: { Accept: "application/json" },
		})

		if (!response.ok) return null

		const data = (await response.json()) as {
			status?: string
			data?: { screenshot?: { url?: string } }
		}

		if (data.status === "success" && data.data?.screenshot?.url) {
			return data.data.screenshot.url
		}
		return null
	} catch {
		return null
	}
}

/**
 * Search for a single mention and return the best result
 */
async function searchForMention(
	mention: ExtractedMention,
): Promise<RelatedLink | null> {
	// Build search query based on type
	let query = mention.name
	const domains: string[] = []

	switch (mention.type) {
		case "repository":
			query = `${mention.name} github repository`
			domains.push("github.com")
			break
		case "framework":
		case "tool":
			query = `${mention.name} official website`
			break
		case "video":
			query = `${mention.name} youtube`
			domains.push("youtube.com")
			break
		default:
			query = `${mention.name} official`
	}

	try {
		const results = await searchWebWithExa(query, {
			limit: 3,
			includeDomains: domains.length > 0 ? domains : undefined,
		})

		let best: (typeof results)[0] | null = null

		if (results.length === 0) {
			// Retry without domain filter
			const retryResults = await searchWebWithExa(`${mention.name} official`, {
				limit: 3,
			})
			if (retryResults.length === 0) return null
			best = retryResults[0]
		} else {
			best = results[0]
		}

		if (!best?.url) return null

		// If no image from Exa, try to get screenshot from Microlink
		let image = best.image
		if (!image && best.url) {
			image = await getPreviewImage(best.url)
		}

		return {
			title: best.title || mention.name,
			url: best.url,
			image,
			favicon: best.favicon,
			snippet: best.snippet,
			type: mention.type,
			mentionedAs: mention.name,
		}
	} catch (error) {
		console.warn(`[RelatedLinks] Search failed for "${mention.name}":`, error)
		return null
	}
}

/**
 * Main pipeline: extract mentions and search for related links
 */
export async function findRelatedLinks(
	content: string,
	options?: {
		maxLinks?: number
		includeTypes?: ExtractedMention["type"][]
	},
): Promise<RelatedLink[]> {
	if (!env.EXA_API_KEY) {
		console.warn("[RelatedLinks] EXA_API_KEY not configured, skipping")
		return []
	}

	const maxLinks = options?.maxLinks ?? 10

	// Step 1: Extract mentions from content
	const mentions = await extractMentionsFromContent(content, {
		maxMentions: maxLinks + 5, // Extract more to account for search failures
	})

	if (mentions.length === 0) {
		console.log("[RelatedLinks] No mentions found in content")
		return []
	}

	console.log(`[RelatedLinks] Found ${mentions.length} mentions:`, mentions)

	// Filter by type if specified
	const filteredMentions = options?.includeTypes
		? mentions.filter((m) => options.includeTypes?.includes(m.type))
		: mentions

	// Step 2: Search for each mention sequentially with delay to avoid rate limits
	const results: RelatedLink[] = []
	const alternatives: RelatedLink[] = []
	const DELAY_MS = 300 // ~3 requests per second max (under Exa's 5/sec limit)

	// First, find all mentioned tools/apps
	for (const mention of filteredMentions) {
		if (results.length >= maxLinks) break

		const result = await searchForMention(mention)

		if (result) {
			// Deduplicate by URL
			if (!results.some((r) => r.url === result.url)) {
				results.push(result)
			}
		}

		// Add delay to avoid rate limiting
		await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
	}

	// Step 3: Search for alternatives to tools/frameworks (limit to first 3)
	const toolMentions = filteredMentions
		.filter((m) => ["tool", "framework"].includes(m.type))
		.slice(0, 3)

	for (const mention of toolMentions) {
		if (alternatives.length >= 6) break // Max 6 alternatives total

		await new Promise((resolve) => setTimeout(resolve, DELAY_MS))

		const alts = await searchForAlternatives(mention)

		for (const alt of alts) {
			// Deduplicate
			if (
				!results.some((r) => r.url === alt.url) &&
				!alternatives.some((r) => r.url === alt.url)
			) {
				alternatives.push(alt)
			}
		}
	}

	const allLinks = [...results, ...alternatives]
	console.log(
		`[RelatedLinks] Found ${results.length} mentioned + ${alternatives.length} alternatives = ${allLinks.length} total`,
	)
	return allLinks
}

/**
 * Serialize related links for storage in document metadata
 */
export function serializeRelatedLinks(links: RelatedLink[]): string {
	return JSON.stringify(links)
}

/**
 * Parse related links from stored metadata
 */
export function parseRelatedLinks(stored: unknown): RelatedLink[] {
	if (!stored) return []

	try {
		if (typeof stored === "string") {
			return JSON.parse(stored) as RelatedLink[]
		}
		if (Array.isArray(stored)) {
			return stored as RelatedLink[]
		}
		return []
	} catch {
		return []
	}
}
