import { performance } from "node:perf_hooks"
import { config as loadEnv } from "dotenv"

// Load environment variables before importing services that validate env
loadEnv({ path: ".env.local" })
loadEnv()

// Provide minimal fallbacks for required env values so AnalysisService can initialise
const ensureEnv = (key: string, fallback: string) => {
	if (!process.env[key] || process.env[key]?.length === 0) {
		process.env[key] = fallback
	}
}

ensureEnv("SUPABASE_URL", "https://example.supabase.co")
ensureEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-placeholder")
ensureEnv("SUPABASE_ANON_KEY", "anon-placeholder")
ensureEnv("ANTHROPIC_API_KEY", "anthropic-placeholder")
ensureEnv("APP_URL", "http://localhost:3000")
ensureEnv("RESEND_FROM_EMAIL", "noreply@example.com")

const { AnalysisService } = await import("./src/services/analysis-service")
const { getCacheService } = await import("./src/services/cache")

if (!process.env.GOOGLE_API_KEY) {
	console.error(
		"GOOGLE_API_KEY deve estar configurada para executar analyzeYouTubeUrl.",
	)
	process.exit(1)
}

type AnalysisResult = Awaited<
	ReturnType<InstanceType<typeof AnalysisService>["analyzeYouTubeUrl"]>
>

const service = new AnalysisService("gemini-2.5-flash")
const cache = getCacheService()
const fallbackCache = new Map<string, AnalysisResult>()

const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
const PROVIDED_TITLE = "Rick Astley - Never Gonna Give You Up"
const CACHE_KEY = `test:analyzeVideo:${YOUTUBE_URL}`

const cacheAvailable = cache.isAvailable()

if (cacheAvailable) {
	await cache.delete(CACHE_KEY)
} else {
	fallbackCache.delete(CACHE_KEY)
	console.warn(
		"[test-analyzevideo] CacheService indisponível, usando cache em memória.",
	)
}

function validateResult(result: AnalysisResult) {
	if (!result) {
		throw new Error("Resultado da análise está vazio.")
	}

	if (!result.summary || result.summary.trim().length === 0) {
		throw new Error("Resultado da análise não contém resumo.")
	}

	if (result.mode !== "youtube") {
		throw new Error(`Modo inesperado: ${result.mode}`)
	}

	if (result.title == null || result.title.trim().length === 0) {
		throw new Error("Resultado da análise não contém título.")
	}

	if (!result.previewMetadata) {
		throw new Error("Resultado da análise não contém previewMetadata.")
	}
}

async function readFromCache(): Promise<AnalysisResult | null> {
	if (cacheAvailable) {
		return (await cache.get<AnalysisResult>(CACHE_KEY)) ?? null
	}
	return fallbackCache.get(CACHE_KEY) ?? null
}

async function writeToCache(result: AnalysisResult) {
	if (cacheAvailable) {
		await cache.set(CACHE_KEY, result, { ttl: 1800 })
	}
	fallbackCache.set(CACHE_KEY, result)
}

async function runAnalysis(attempt: number) {
	const start = performance.now()

	let fromCache = false
	let result = await readFromCache()

	if (!result) {
		console.log(
			`[test-analyzevideo] Execução ${attempt}: cache miss, iniciando análise`,
		)
		result = await service.analyzeYouTubeUrl(YOUTUBE_URL, PROVIDED_TITLE)
		await writeToCache(result)
	} else {
		fromCache = true
		console.log(`[test-analyzevideo] Execução ${attempt}: cache hit`)
	}

	const elapsedMs = performance.now() - start
	validateResult(result)

	console.log(
		`[test-analyzevideo] Execução ${attempt} finalizada em ${elapsedMs.toFixed(
			0,
		)}ms (${fromCache ? "cache" : "análise completa"})`,
	)

	return { result, elapsedMs, fromCache }
}

async function main() {
	const first = await runAnalysis(1)
	const second = await runAnalysis(2)

	const faster = second.elapsedMs < first.elapsedMs
	if (!faster) {
		console.warn(
			"[test-analyzevideo] Atenção: segunda execução não foi mais rápida. Verifique configuração de cache.",
		)
	}

	console.log("[test-analyzevideo] Resultado final:")
	console.log(JSON.stringify(second.result, null, 2))

	console.log(
		`[test-analyzevideo] Tempo 1ª execução: ${first.elapsedMs.toFixed(0)}ms, 2ª execução: ${second.elapsedMs.toFixed(0)}ms`,
	)
	console.log(
		`[test-analyzevideo] Cache disponível: ${
			cacheAvailable ? "Redis" : "Memória local"
		}, hit na 2ª execução: ${second.fromCache}`,
	)

	if (!faster) {
		process.exitCode = 1
	}
}

main().catch((error) => {
	console.error("[test-analyzevideo] Erro durante o teste:", error)
	process.exit(1)
})
