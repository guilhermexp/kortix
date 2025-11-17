import { createDocumentExtractorService } from "../extraction"
import { createIngestionOrchestrator } from "../orchestration"
import { createPreviewGeneratorService } from "../preview"
import { createDocumentProcessorService } from "../processing"

let orchestratorServiceInstance: Awaited<
	ReturnType<typeof createIngestionOrchestrator>
> | null = null
let extractorServiceInstance: Awaited<
	ReturnType<typeof createDocumentExtractorService>
> | null = null
let processorServiceInstance: Awaited<
	ReturnType<typeof createDocumentProcessorService>
> | null = null
let previewServiceInstance: Awaited<
	ReturnType<typeof createPreviewGeneratorService>
> | null = null

export async function getOrchestrator() {
	if (!orchestratorServiceInstance) {
		extractorServiceInstance = createDocumentExtractorService({
			pdf: { enabled: true, ocrEnabled: true, ocrProvider: "replicate" },
			youtube: {
				enabled: true,
				preferredLanguages: ["en", "en-US", "pt", "pt-BR"],
			},
			url: { enabled: true },
			circuitBreaker: {
				enabled: true,
				failureThreshold: 5,
				resetTimeout: 60000,
			},
		})
		processorServiceInstance = createDocumentProcessorService({
			chunking: { enabled: true, chunkSize: 800, chunkOverlap: 100 },
			embedding: {
				enabled: true,
				provider: "voyage",
				batchSize: 10,
				useCache: true,
			},
			summarization: { enabled: true, provider: "openrouter" },
			tagging: { enabled: true, maxTags: 10 },
		})
		previewServiceInstance = createPreviewGeneratorService({
			enableImageExtraction: true,
			enableSvgGeneration: true,
			enableFaviconExtraction: true,
		})
		orchestratorServiceInstance = createIngestionOrchestrator({
			timeout: 60000,
			circuitBreaker: { enabled: true },
		})
		await Promise.all([
			extractorServiceInstance.initialize(),
			processorServiceInstance.initialize(),
			previewServiceInstance.initialize(),
			orchestratorServiceInstance.initialize(),
		])
		orchestratorServiceInstance.setExtractorService(extractorServiceInstance)
		orchestratorServiceInstance.setProcessorService(processorServiceInstance)
		orchestratorServiceInstance.setPreviewService(previewServiceInstance)
	}
	return orchestratorServiceInstance
}
