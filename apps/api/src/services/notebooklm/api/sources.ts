/**
 * NotebookLM Sources API
 * Add URLs, text, and manage sources within notebooks.
 */

import type { NotebookLMClient } from "../client"
import { RPCMethod, type Source, SourceStatus, SourceTypeCode } from "../types"

const YOUTUBE_REGEX =
	/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/

export class SourcesAPI {
	constructor(private client: NotebookLMClient) {}

	/**
	 * List all sources in a notebook.
	 */
	async list(notebookId: string): Promise<Source[]> {
		const { rawSourceData } = await this.client.notebooks.get(notebookId)
		return rawSourceData.map(parseSource).filter(Boolean) as Source[]
	}

	/**
	 * Add a URL source to a notebook.
	 * Automatically detects YouTube URLs and routes accordingly.
	 */
	async addUrl(notebookId: string, url: string): Promise<Source | null> {
		const isYouTube = YOUTUBE_REGEX.test(url)

		let params: unknown[]
		if (isYouTube) {
			// YouTube source format
			params = [
				[[null, null, null, null, null, null, null, [url], null, null, 1]],
				notebookId,
				[2],
				[1],
			]
		} else {
			// Regular URL source format
			params = [
				[[null, null, [url], null, null, null, null, null]],
				notebookId,
				[2],
				null,
				null,
			]
		}

		const result = await this.client.rpcCall(RPCMethod.ADD_SOURCE, params)
		if (!Array.isArray(result)) return null

		// Result contains the source data — try to extract source ID
		const sourceId = extractSourceIdFromAddResult(result)
		if (!sourceId) return null

		return {
			id: sourceId,
			title: url,
			url,
			kind: isYouTube ? "youtube" : "web_page",
			createdAt: new Date(),
			status: SourceStatus.PROCESSING,
			isReady: false,
			isProcessing: true,
			isError: false,
		}
	}

	/**
	 * Add a pasted text source to a notebook.
	 */
	async addText(
		notebookId: string,
		title: string,
		content: string,
	): Promise<Source | null> {
		const params = [
			[[null, [title, content], null, null, null, null, null, null]],
			notebookId,
			[2],
			null,
			null,
		]

		const result = await this.client.rpcCall(RPCMethod.ADD_SOURCE, params)
		if (!Array.isArray(result)) return null

		const sourceId = extractSourceIdFromAddResult(result)
		if (!sourceId) return null

		return {
			id: sourceId,
			title,
			url: null,
			kind: "pasted_text",
			createdAt: new Date(),
			status: SourceStatus.PROCESSING,
			isReady: false,
			isProcessing: true,
			isError: false,
		}
	}

	/**
	 * Delete a source from a notebook.
	 */
	async delete(notebookId: string, sourceId: string): Promise<boolean> {
		await this.client.rpcCall(RPCMethod.DELETE_SOURCE, [[[sourceId]]])
		return true
	}

	/**
	 * Rename a source.
	 */
	async rename(
		notebookId: string,
		sourceId: string,
		newTitle: string,
	): Promise<boolean> {
		await this.client.rpcCall(RPCMethod.UPDATE_SOURCE, [
			null,
			[sourceId],
			[[[newTitle]]],
		])
		return true
	}

	/**
	 * Get AI guide/summary for a specific source.
	 */
	async getGuide(
		notebookId: string,
		sourceId: string,
	): Promise<{ summary: string; keywords: string[] }> {
		const result = await this.client.rpcCall(RPCMethod.GET_SOURCE_GUIDE, [
			[[[sourceId]]],
		])

		if (!Array.isArray(result)) {
			return { summary: "", keywords: [] }
		}

		return {
			summary: String(result[0]?.[0] ?? ""),
			keywords: Array.isArray(result[1]) ? result[1].map(String) : [],
		}
	}

	/**
	 * Wait until a source is ready (polling).
	 */
	async waitUntilReady(
		notebookId: string,
		sourceId: string,
		timeoutMs = 120_000,
		pollIntervalMs = 3_000,
	): Promise<Source | null> {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			const sources = await this.list(notebookId)
			const source = sources.find((s) => s.id === sourceId)
			if (source?.isReady) return source
			if (source?.isError) return source
			await new Promise((r) => setTimeout(r, pollIntervalMs))
		}
		return null
	}
}

// ─── Parsing Helpers ─────────────────────────────────────────

function parseSource(raw: unknown): Source | null {
	if (!Array.isArray(raw)) return null

	const id = raw[0]?.[0]
	if (typeof id !== "string") return null

	const title = raw[1] ?? "Untitled"
	const url = raw[2]?.[7]?.[0] ?? null
	const timestamp = raw[2]?.[2]?.[0]
	const statusCode = raw[3]?.[1] ?? 0
	const typeCode = raw[2]?.[4] ?? 0

	return {
		id: String(id),
		title: String(title),
		url: url ? String(url) : null,
		kind: SourceTypeCode[typeCode] ?? "unknown",
		createdAt:
			typeof timestamp === "number" ? new Date(timestamp * 1000) : null,
		status: statusCode,
		isReady: statusCode === SourceStatus.READY,
		isProcessing:
			statusCode === SourceStatus.PROCESSING ||
			statusCode === SourceStatus.PREPARING,
		isError: statusCode === SourceStatus.ERROR,
	}
}

function extractSourceIdFromAddResult(result: unknown[]): string | null {
	// The ADD_SOURCE response structure varies, but source ID is usually in
	// result[0][0][0][0] or result[0][0][0]
	try {
		const nested = result[0]
		if (Array.isArray(nested)) {
			// Walk the nested arrays looking for a UUID-like string
			const candidate = nested[0]?.[0]?.[0] ?? nested[0]?.[0] ?? nested[0]
			if (typeof candidate === "string" && candidate.length > 10) {
				return candidate
			}
		}
	} catch {
		// Ignore parsing errors
	}
	return null
}
