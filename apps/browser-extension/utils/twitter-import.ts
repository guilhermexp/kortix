/**
 * Twitter Bookmarks Import Module
 * Handles the import process for Twitter bookmarks
 */

import { saveAllTweets } from "./api"
import { createTwitterAPIHeaders, getTwitterTokens } from "./twitter-auth"
import {
	BOOKMARKS_URL,
	buildRequestVariables,
	extractNextCursor,
	getAllTweets,
	type TwitterAPIResponse,
	tweetToMarkdown,
} from "./twitter-utils"
import type { MemoryPayload } from "./types"

export interface ImportResult {
	created: number
	skipped: number
	failed: number
	total: number
}

export type ImportProgressCallback = (message: string) => Promise<void>

export type ImportCompleteCallback = (result: ImportResult) => Promise<void>

export interface TwitterImportConfig {
	onProgress: ImportProgressCallback
	onComplete: ImportCompleteCallback
	onError: (error: Error) => Promise<void>
}

/**
 * Rate limiting configuration
 */
class RateLimiter {
	private waitTime = 60000 // Start with 1 minute

	async handleRateLimit(onProgress: ImportProgressCallback): Promise<void> {
		const waitTimeInSeconds = this.waitTime / 1000

		await onProgress(
			`Rate limit reached. Waiting for ${waitTimeInSeconds} seconds before retrying...`,
		)

		await new Promise((resolve) => setTimeout(resolve, this.waitTime))
		this.waitTime *= 2 // Exponential backoff
	}

	reset(): void {
		this.waitTime = 60000
	}
}

/**
 * Main class for handling Twitter bookmarks import
 */
export class TwitterImporter {
	private importInProgress = false
	private rateLimiter = new RateLimiter()

	constructor(private config: TwitterImportConfig) {}

	/**
	 * Starts the import process for all Twitter bookmarks
	 * @returns Promise that resolves when import is complete
	 */
	async startImport(): Promise<void> {
		if (this.importInProgress) {
			throw new Error("Import already in progress")
		}

		this.importInProgress = true
		const uniqueGroupId = crypto.randomUUID()
		const initialResult: ImportResult = {
			created: 0,
			skipped: 0,
			failed: 0,
			total: 0,
		}

		try {
			await this.batchImportAll("", initialResult, uniqueGroupId)
			this.rateLimiter.reset()
		} catch (error) {
			await this.config.onError(error as Error)
		} finally {
			this.importInProgress = false
		}
	}

	/**
	 * Recursive function to import all bookmarks with pagination
	 * @param cursor - Pagination cursor for Twitter API
	 * @param cumulativeResult - Accumulated import results across pages
	 */
	private async batchImportAll(
		cursor = "",
		cumulativeResult: ImportResult,
		uniqueGroupId = "twitter_bookmarks",
	): Promise<void> {
		try {
			// Get authentication tokens
			const tokens = await getTwitterTokens()
			if (!tokens) {
				await this.config.onProgress(
					"Please visit Twitter/X first to capture authentication tokens",
				)
				return
			}

			// Create headers for API request
			const headers = createTwitterAPIHeaders(tokens)

			// Build API request with pagination
			const variables = buildRequestVariables(cursor)
			const urlWithCursor = cursor
				? `${BOOKMARKS_URL}&variables=${encodeURIComponent(JSON.stringify(variables))}`
				: BOOKMARKS_URL

			const response = await fetch(urlWithCursor, {
				method: "GET",
				headers,
				redirect: "follow",
			})

			if (!response.ok) {
				const errorText = await response.text()
				console.error(`Twitter API Error ${response.status}:`, errorText)

				if (response.status === 429) {
					await this.rateLimiter.handleRateLimit(this.config.onProgress)
					return this.batchImportAll(
						cursor,
						cumulativeResult,
						uniqueGroupId,
					)
				}
				if (
					response.status === 400 ||
					(response.status === 403 && errorText.toLowerCase().includes("bad"))
				) {
					throw new Error(
						`Twitter API returned ${response.status}. The GraphQL query hash may be outdated — please update the extension or report this issue.`,
					)
				}
				throw new Error(
					`Failed to fetch data: ${response.status} - ${errorText}`,
				)
			}

			const data: TwitterAPIResponse = await response.json()
			const tweets = getAllTweets(data)

			const documents: MemoryPayload[] = []

			// Convert tweets to MemoryPayload
			for (const tweet of tweets) {
				try {
					const tweetUrl = `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`
					// Pick best preview image: photo > video thumbnail (no avatar fallback)
					const previewImage =
						tweet.photos?.[0]?.url ||
						tweet.videos?.[0]?.thumbnail_url ||
						""
					const metadata: MemoryPayload["metadata"] = {
						sm_source: "consumer",
						type: "tweet",
						url: tweetUrl,
						originalUrl: tweetUrl,
						tweet_id: tweet.id_str,
						author: tweet.user.screen_name,
						created_at: tweet.created_at,
						likes: tweet.favorite_count,
						retweets: tweet.retweet_count || 0,
						sm_internal_group_id: uniqueGroupId,
						raw_tweet: JSON.stringify(tweet),
						...(previewImage && { image: previewImage }),
					}
					documents.push({
						containerTags: ["sm_project_twitter_bookmarks"],
						content: tweetToMarkdown(tweet),
						metadata,
						customId: tweet.id_str,
					})
				} catch (error) {
					console.error("Error importing tweet:", error)
				}
			}

			// Save batch and parse response to count actual results
			try {
				if (documents.length > 0) {
					await this.config.onProgress(
						`Saving ${documents.length} tweets...`,
					)
					const batchResponse = await saveAllTweets(documents)

					for (const result of batchResponse.results) {
						cumulativeResult.total++
						if (result.status === "created") {
							cumulativeResult.created++
						} else if (result.status === "skipped") {
							cumulativeResult.skipped++
						} else {
							cumulativeResult.failed++
						}
					}

					const parts: string[] = []
					if (cumulativeResult.created > 0) {
						parts.push(`${cumulativeResult.created} new`)
					}
					if (cumulativeResult.skipped > 0) {
						parts.push(`${cumulativeResult.skipped} already saved`)
					}
					await this.config.onProgress(
						`Imported ${parts.join(", ")} tweets so far...`,
					)
				}
			} catch (error) {
				console.error("Error saving tweets batch:", error)
				await this.config.onError(error as Error)
				return
			}

			// Handle pagination
			const instructions =
				data.data?.bookmark_timeline_v2?.timeline?.instructions
			const nextCursor = extractNextCursor(instructions || [])

			if (nextCursor && tweets.length > 0) {
				await new Promise((resolve) => setTimeout(resolve, 1000)) // Rate limiting
				await this.batchImportAll(
					nextCursor,
					cumulativeResult,
					uniqueGroupId,
				)
			} else {
				await this.config.onComplete(cumulativeResult)
			}
		} catch (error) {
			console.error("Batch import error:", error)
			await this.config.onError(error as Error)
		}
	}
}
