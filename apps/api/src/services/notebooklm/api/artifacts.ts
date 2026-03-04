/**
 * NotebookLM Artifacts API
 * Generate audio overviews, reports, videos, quizzes, infographics, etc.
 */

import type { NotebookLMClient } from "../client"
import {
	type Artifact,
	ArtifactStatus,
	ArtifactTypeCode,
	type AudioFormat,
	type AudioLength,
	type GenerationStatus,
	type InfographicDetail,
	type InfographicOrientation,
	type ReportFormat,
	RPCMethod,
	type SlideDeckFormat,
	type SlideDeckLength,
	type VideoFormat,
	type VideoStyle,
} from "../types"

export class ArtifactsAPI {
	constructor(private client: NotebookLMClient) {}

	// ─── Generation Methods ──────────────────────────────────

	/**
	 * Generate an audio overview (podcast).
	 */
	async generateAudio(
		notebookId: string,
		options: {
			sourceIds?: string[]
			format?: number // AudioFormat value
			length?: number // AudioLength value
			instructions?: string
			language?: string
		} = {},
	): Promise<GenerationStatus> {
		const sourceIds =
			options.sourceIds ?? (await this.client.getSourceIds(notebookId))
		const sourceIdsDouble = sourceIds.map((id) => [id])
		const sourceIdsTriple = sourceIds.map((id) => [[id]])
		const lang = options.language ?? "en"
		const formatCode = options.format ?? 1 // DEEP_DIVE
		const lengthCode = options.length ?? 2 // DEFAULT

		const params = [
			[2],
			notebookId,
			[
				null,
				null,
				ArtifactTypeCode.AUDIO,
				sourceIdsTriple,
				null,
				null,
				[
					null,
					[
						options.instructions ?? null,
						lengthCode,
						null,
						sourceIdsDouble,
						lang,
						null,
						formatCode,
					],
				],
			],
		]

		return this.createArtifact(params)
	}

	/**
	 * Generate a video overview.
	 */
	async generateVideo(
		notebookId: string,
		options: {
			sourceIds?: string[]
			format?: number // VideoFormat value
			style?: string // VideoStyle value
			instructions?: string
			language?: string
		} = {},
	): Promise<GenerationStatus> {
		const sourceIds =
			options.sourceIds ?? (await this.client.getSourceIds(notebookId))
		const sourceIdsDouble = sourceIds.map((id) => [id])
		const sourceIdsTriple = sourceIds.map((id) => [[id]])
		const lang = options.language ?? "en"
		const formatCode = options.format ?? 1 // EXPLAINER
		const styleCode = options.style ?? "AUTO_SELECT"

		const params = [
			[2],
			notebookId,
			[
				null,
				null,
				ArtifactTypeCode.VIDEO,
				sourceIdsTriple,
				null,
				null,
				null,
				null,
				[
					null,
					null,
					[
						sourceIdsDouble,
						lang,
						options.instructions ?? null,
						null,
						formatCode,
						styleCode,
					],
				],
			],
		]

		return this.createArtifact(params)
	}

	/**
	 * Generate a report (briefing doc, study guide, blog post, custom).
	 */
	async generateReport(
		notebookId: string,
		options: {
			sourceIds?: string[]
			format?: string // ReportFormat value
			title?: string
			description?: string
			prompt?: string
			language?: string
		} = {},
	): Promise<GenerationStatus> {
		const sourceIds =
			options.sourceIds ?? (await this.client.getSourceIds(notebookId))
		const sourceIdsDouble = sourceIds.map((id) => [id])
		const sourceIdsTriple = sourceIds.map((id) => [[id]])
		const lang = options.language ?? "en"

		const params = [
			[2],
			notebookId,
			[
				null,
				null,
				ArtifactTypeCode.REPORT,
				sourceIdsTriple,
				null,
				null,
				null,
				[
					null,
					[
						options.title ?? null,
						options.description ?? null,
						null,
						sourceIdsDouble,
						lang,
						options.prompt ?? null,
						null,
						true,
					],
				],
			],
		]

		return this.createArtifact(params)
	}

	/**
	 * Generate an infographic.
	 */
	async generateInfographic(
		notebookId: string,
		options: {
			sourceIds?: string[]
			orientation?: number // InfographicOrientation value
			detail?: number // InfographicDetail value
			instructions?: string
			language?: string
		} = {},
	): Promise<GenerationStatus> {
		const sourceIds =
			options.sourceIds ?? (await this.client.getSourceIds(notebookId))
		const sourceIdsTriple = sourceIds.map((id) => [[id]])
		const lang = options.language ?? "en"

		const artifactPayload: unknown[] = new Array(19).fill(null)
		artifactPayload[2] = ArtifactTypeCode.INFOGRAPHIC
		artifactPayload[3] = sourceIdsTriple
		artifactPayload[14] = [
			[
				options.instructions ?? null,
				lang,
				null,
				options.orientation ?? 1, // LANDSCAPE
				options.detail ?? 2, // STANDARD
			],
		]

		const params = [[2], notebookId, artifactPayload]
		return this.createArtifact(params)
	}

	/**
	 * Generate a slide deck.
	 */
	async generateSlideDeck(
		notebookId: string,
		options: {
			sourceIds?: string[]
			format?: number // SlideDeckFormat value
			length?: number // SlideDeckLength value
			instructions?: string
			language?: string
		} = {},
	): Promise<GenerationStatus> {
		const sourceIds =
			options.sourceIds ?? (await this.client.getSourceIds(notebookId))
		const sourceIdsTriple = sourceIds.map((id) => [[id]])
		const lang = options.language ?? "en"

		const artifactPayload: unknown[] = new Array(19).fill(null)
		artifactPayload[2] = ArtifactTypeCode.SLIDE_DECK
		artifactPayload[3] = sourceIdsTriple
		artifactPayload[16] = [
			[
				options.instructions ?? null,
				lang,
				options.format ?? 1, // DETAILED_DECK
				options.length ?? 1, // DEFAULT
			],
		]

		const params = [[2], notebookId, artifactPayload]
		return this.createArtifact(params)
	}

	/**
	 * Generate a mind map.
	 */
	async generateMindMap(
		notebookId: string,
		sourceIds?: string[],
	): Promise<GenerationStatus> {
		const ids = sourceIds ?? (await this.client.getSourceIds(notebookId))
		const sourceIdsTriple = ids.map((id) => [[id]])

		const params = [notebookId, sourceIdsTriple]
		const result = await this.client.rpcCall(
			RPCMethod.GENERATE_MIND_MAP,
			params,
		)

		let artifactId: string | null = null
		if (Array.isArray(result)) {
			artifactId = typeof result[0] === "string" ? result[0] : null
		}

		return {
			taskId: artifactId,
			status: ArtifactStatus.PROCESSING,
			url: null,
			error: null,
			isComplete: false,
			isFailed: false,
			isRateLimited: false,
		}
	}

	// ─── Listing & Status ────────────────────────────────────

	/**
	 * List all artifacts in a notebook.
	 */
	async list(notebookId: string): Promise<Artifact[]> {
		const result = await this.client.rpcCall(RPCMethod.LIST_ARTIFACTS, [
			[2],
			notebookId,
			'NOT artifact.status = "ARTIFACT_STATUS_SUGGESTED"',
		])

		if (!Array.isArray(result)) return []

		const items = Array.isArray(result[0]) ? result[0] : []
		return items.map(parseArtifact).filter(Boolean) as Artifact[]
	}

	/**
	 * Poll generation status by checking artifact list.
	 */
	async pollStatus(
		notebookId: string,
		artifactId: string,
	): Promise<GenerationStatus> {
		const artifacts = await this.list(notebookId)
		const artifact = artifacts.find((a) => a.id === artifactId)

		if (!artifact) {
			return {
				taskId: artifactId,
				status: ArtifactStatus.PENDING,
				url: null,
				error: null,
				isComplete: false,
				isFailed: false,
				isRateLimited: false,
			}
		}

		return {
			taskId: artifactId,
			status: artifact.status,
			url: artifact.url,
			error: artifact.isFailed ? "Generation failed" : null,
			isComplete: artifact.isCompleted,
			isFailed: artifact.isFailed,
			isRateLimited: false,
		}
	}

	/**
	 * Wait for artifact generation to complete (polling).
	 */
	async waitForCompletion(
		notebookId: string,
		artifactId: string,
		timeoutMs = 300_000,
		pollIntervalMs = 5_000,
	): Promise<GenerationStatus> {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			const status = await this.pollStatus(notebookId, artifactId)
			if (status.isComplete || status.isFailed) return status
			await new Promise((r) => setTimeout(r, pollIntervalMs))
		}
		return {
			taskId: artifactId,
			status: ArtifactStatus.FAILED,
			url: null,
			error: "Timeout waiting for generation",
			isComplete: false,
			isFailed: true,
			isRateLimited: false,
		}
	}

	/**
	 * Delete an artifact.
	 */
	async delete(notebookId: string, artifactId: string): Promise<boolean> {
		await this.client.rpcCall(RPCMethod.DELETE_ARTIFACT, [
			notebookId,
			artifactId,
		])
		return true
	}

	// ─── Internal ────────────────────────────────────────────

	private async createArtifact(params: unknown[]): Promise<GenerationStatus> {
		const result = await this.client.rpcCall(RPCMethod.CREATE_ARTIFACT, params)

		// Result typically contains the artifact ID for polling
		let artifactId: string | null = null
		if (Array.isArray(result)) {
			artifactId = typeof result[0] === "string" ? result[0] : null
		}

		return {
			taskId: artifactId,
			status: ArtifactStatus.PROCESSING,
			url: null,
			error: null,
			isComplete: false,
			isFailed: false,
			isRateLimited: false,
		}
	}
}

// ─── Parsing Helpers ─────────────────────────────────────────

const ARTIFACT_TYPE_MAP: Record<number, string> = {
	1: "audio",
	2: "report",
	3: "video",
	4: "quiz",
	5: "mind_map",
	7: "infographic",
	8: "slide_deck",
	9: "data_table",
}

function parseArtifact(raw: unknown): Artifact | null {
	if (!Array.isArray(raw)) return null

	const id = raw[0]
	if (typeof id !== "string") return null

	const typeCode = raw[2] ?? 0
	const statusCode = raw[4] ?? 0
	const timestamp = raw[15]?.[0]

	// Determine kind — for quiz/flashcards, check variant
	let kind = ARTIFACT_TYPE_MAP[typeCode] ?? "unknown"
	if (typeCode === ArtifactTypeCode.QUIZ_OR_FLASHCARDS) {
		const variant = raw[9]?.[1]?.[0]
		kind = variant === 1 ? "flashcards" : "quiz"
	}

	// Extract URLs based on type
	const audioUrls: string[] = []
	const videoUrls: string[] = []
	let reportContent: string | null = null

	// Audio URLs at raw[6][5]
	if (Array.isArray(raw[6]?.[5])) {
		for (const item of raw[6][5]) {
			if (Array.isArray(item) && item[2] === "audio/mp4" && item[0]) {
				audioUrls.push(String(item[0]))
			}
		}
	}

	// Video URLs at raw[8]
	if (Array.isArray(raw[8])) {
		for (const item of raw[8]) {
			if (Array.isArray(item) && item[2] === "video/mp4" && item[0]) {
				videoUrls.push(String(item[0]))
			}
		}
	}

	// Report content at raw[7][0]
	if (raw[7]?.[0] && typeof raw[7][0] === "string") {
		reportContent = raw[7][0]
	}

	const url = audioUrls[0] ?? videoUrls[0] ?? null

	return {
		id: String(id),
		title: String(raw[1] ?? ""),
		kind,
		status: statusCode,
		createdAt:
			typeof timestamp === "number" ? new Date(timestamp * 1000) : null,
		url,
		isCompleted: statusCode === ArtifactStatus.COMPLETED,
		isProcessing:
			statusCode === ArtifactStatus.PROCESSING ||
			statusCode === ArtifactStatus.PENDING,
		isFailed: statusCode === ArtifactStatus.FAILED,
		reportContent,
		audioUrls,
		videoUrls,
	}
}
