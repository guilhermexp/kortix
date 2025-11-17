import { env } from "../env"

/**
 * Replicate API Service
 * Provides integration with Replicate models, starting with Deepseek OCR
 */

type DeepseekOCRTaskType =
	| "Convert to Markdown"
	| "Free OCR"
	| "Parse Figure"
	| "Locate Object by Reference"

type DeepseekOCRResolution =
	| "Gundam (Recommended)"
	| "Tiny"
	| "Small"
	| "Base"
	| "Large"

type ReplicatePredictionStatus =
	| "starting"
	| "processing"
	| "succeeded"
	| "canceled"
	| "failed"

interface ReplicatePrediction {
	id: string
	status: ReplicatePredictionStatus
	output?: string | string[]
	error?: string
	metrics?: {
		predict_time?: number
		total_time?: number
	}
}

interface DeepseekOCRInput {
	image: string // URL or data URL
	task_type?: DeepseekOCRTaskType
	resolution_size?: DeepseekOCRResolution
	reference_text?: string
}

const DEEPSEEK_OCR_MODEL =
	"lucataco/deepseek-ocr:cb3b474fbfc56b1664c8c7841550bccecbe7b74c30e45ce938ffca1180b4dff5"
const REPLICATE_API_URL = "https://api.replicate.com/v1"
const MAX_POLL_ATTEMPTS = 60 // 60 attempts * 2s = 2 minutes max
const POLL_INTERVAL_MS = 2000

export class ReplicateService {
	private apiToken: string

	constructor(apiToken?: string) {
		this.apiToken = apiToken || env.REPLICATE_API_TOKEN || ""
		if (!this.apiToken) {
			throw new Error("REPLICATE_API_TOKEN not configured")
		}
	}

	/**
	 * Create a prediction (async operation)
	 */
	private async createPrediction(
		version: string,
		input: Record<string, unknown>,
	): Promise<ReplicatePrediction> {
		const response = await fetch(`${REPLICATE_API_URL}/predictions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				version,
				input,
			}),
		})

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`Replicate API error (${response.status}): ${error}`)
		}

		return response.json() as Promise<ReplicatePrediction>
	}

	/**
	 * Get prediction status
	 */
	private async getPrediction(
		predictionId: string,
	): Promise<ReplicatePrediction> {
		const response = await fetch(
			`${REPLICATE_API_URL}/predictions/${predictionId}`,
			{
				headers: {
					Authorization: `Bearer ${this.apiToken}`,
				},
			},
		)

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`Failed to get prediction: ${error}`)
		}

		return response.json() as Promise<ReplicatePrediction>
	}

	/**
	 * Poll prediction until completion
	 */
	private async waitForPrediction(
		predictionId: string,
	): Promise<ReplicatePrediction> {
		for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
			const prediction = await this.getPrediction(predictionId)

			if (prediction.status === "succeeded") {
				return prediction
			}

			if (prediction.status === "failed" || prediction.status === "canceled") {
				throw new Error(
					`Prediction ${prediction.status}: ${prediction.error || "Unknown error"}`,
				)
			}

			// Still processing, wait before next check
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
		}

		throw new Error("Timeout waiting for prediction to complete")
	}

	/**
	 * Convert Buffer to data URL for Replicate
	 */
	private bufferToDataURL(buffer: Buffer, mimeType: string): string {
		const base64 = buffer.toString("base64")
		return `data:${mimeType};base64,${base64}`
	}

	/**
	 * Run Deepseek OCR on an image buffer
	 *
	 * @param buffer - Image/PDF buffer
	 * @param mimeType - MIME type (e.g., "image/png", "application/pdf")
	 * @param taskType - OCR task type (default: "Convert to Markdown")
	 * @param resolution - Resolution setting (default: "Gundam (Recommended)")
	 * @returns Extracted text/markdown
	 */
	async runDeepseekOCR(
		buffer: Buffer,
		mimeType: string,
		taskType: DeepseekOCRTaskType = "Convert to Markdown",
		resolution: DeepseekOCRResolution = "Gundam (Recommended)",
	): Promise<string> {
		console.log("[Replicate] Starting Deepseek OCR", {
			mimeType,
			taskType,
			resolution,
			bufferSize: buffer.length,
		})

		// Convert buffer to data URL
		const dataURL = this.bufferToDataURL(buffer, mimeType)

		const input: DeepseekOCRInput = {
			image: dataURL,
			task_type: taskType,
			resolution_size: resolution,
		}

		try {
			// Create prediction
			const prediction = await this.createPrediction(DEEPSEEK_OCR_MODEL, input)
			console.log("[Replicate] Prediction created:", prediction.id)

			// Wait for completion
			const result = await this.waitForPrediction(prediction.id)

			// Extract output
			let output = ""
			if (typeof result.output === "string") {
				output = result.output
			} else if (Array.isArray(result.output) && result.output.length > 0) {
				output = result.output.join("\n")
			}

			console.log("[Replicate] OCR completed", {
				predictionId: prediction.id,
				outputLength: output.length,
				predictTime: result.metrics?.predict_time,
				totalTime: result.metrics?.total_time,
			})

			if (!output || output.trim().length === 0) {
				throw new Error("Deepseek OCR returned empty result")
			}

			return output.trim()
		} catch (error) {
			console.error("[Replicate] Deepseek OCR failed:", error)
			throw error
		}
	}

	/**
	 * Check if Replicate is configured and available
	 */
	static isAvailable(): boolean {
		return Boolean(env.REPLICATE_API_TOKEN)
	}
}
