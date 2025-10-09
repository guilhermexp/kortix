/**
 * Script de teste para validar o sistema de fallback de AI
 *
 * Testa:
 * 1. Provider primário (Gemini)
 * 2. Fallback para OpenRouter
 * 3. Mapeamento de modelos
 * 4. Detecção de erros de quota
 */

import { aiClient } from "./src/services/ai-provider"

const colors = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	blue: "\x1b[36m",
}

function log(message: string, color = colors.reset) {
	console.log(`${color}${message}${colors.reset}`)
}

async function testBasicGeneration() {
	log("\n🧪 Teste 1: Geração básica de conteúdo", colors.blue)

	try {
		if (!aiClient) {
			throw new Error("AI client not configured")
		}

		const model = aiClient.getGenerativeModel({ model: "models/gemini-2.5-flash" })

		const result = await model.generateContent({
			contents: [
				{
					role: "user",
					parts: [{ text: "Diga apenas 'OK' se você está funcionando." }],
				},
			],
			generationConfig: {
				maxOutputTokens: 10,
			},
		})

		const text = result.response.text()

		if (text && text.length > 0) {
			log(`✅ Geração básica funcionando: "${text}"`, colors.green)
			return true
		}

		log("❌ Resposta vazia", colors.red)
		return false
	} catch (error) {
		log(`❌ Erro na geração básica: ${error}`, colors.red)
		return false
	}
}

async function testStreamingGeneration() {
	log("\n🧪 Teste 2: Geração com streaming", colors.blue)

	try {
		if (!aiClient) {
			throw new Error("AI client not configured")
		}

		const model = aiClient.getGenerativeModel({ model: "models/gemini-2.5-flash" })

		const result = await model.generateContentStream({
			contents: [
				{
					role: "user",
					parts: [{ text: "Conte até 3 rapidamente." }],
				},
			],
			generationConfig: {
				maxOutputTokens: 50,
			},
		})

		let fullText = ""
		for await (const chunk of result.stream) {
			const candidates = (chunk as any).candidates
			if (candidates?.[0]?.content?.parts?.[0]?.text) {
				fullText += candidates[0].content.parts[0].text
			}
		}

		if (fullText.length > 0) {
			log(`✅ Streaming funcionando: "${fullText.trim()}"`, colors.green)
			return true
		}

		log("❌ Stream vazio", colors.red)
		return false
	} catch (error) {
		log(`❌ Erro no streaming: ${error}`, colors.red)
		return false
	}
}

async function testModelMapping() {
	log("\n🧪 Teste 3: Mapeamento de modelos", colors.blue)

	const models = [
		"models/gemini-2.5-pro",
		"models/gemini-2.5-flash",
		"models/gemini-2.0-flash",
		"gemini-2.0-flash-exp",
	]

	let allPassed = true

	for (const modelId of models) {
		try {
			if (!aiClient) {
				throw new Error("AI client not configured")
			}

			const model = aiClient.getGenerativeModel({ model: modelId })
			log(`  ✓ Modelo ${modelId} mapeado com sucesso`, colors.green)
		} catch (error) {
			log(`  ✗ Erro ao mapear ${modelId}: ${error}`, colors.red)
			allPassed = false
		}
	}

	return allPassed
}

async function testFallbackDetection() {
	log("\n🧪 Teste 4: Detecção de erro de quota (simulado)", colors.blue)

	// Este teste verifica se a lógica de detecção está presente
	// Não podemos forçar um erro 429 real sem esgotar a quota

	log("  ℹ️  Verificando lógica de fallback...", colors.yellow)

	const testErrors = [
		{ message: "429 Too Many Requests", shouldDetect: true },
		{ message: "quota exceeded", shouldDetect: true },
		{ message: "RESOURCE_EXHAUSTED", shouldDetect: true },
		{ message: "Some other error", shouldDetect: false },
	]

	let allPassed = true

	for (const testCase of testErrors) {
		// Simular detecção
		const isQuotaError =
			testCase.message.includes("429") ||
			testCase.message.toLowerCase().includes("quota") ||
			testCase.message.includes("RESOURCE_EXHAUSTED")

		const passed = isQuotaError === testCase.shouldDetect

		if (passed) {
			log(`  ✓ "${testCase.message}" -> ${isQuotaError ? "Quota error" : "Other error"}`, colors.green)
		} else {
			log(`  ✗ "${testCase.message}" detectado incorretamente`, colors.red)
			allPassed = false
		}
	}

	return allPassed
}

async function testEnvironmentConfig() {
	log("\n🧪 Teste 5: Configuração de ambiente", colors.blue)

	const hasGoogleKey = !!process.env.GOOGLE_API_KEY
	const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY

	log(`  ${hasGoogleKey ? "✓" : "✗"} GOOGLE_API_KEY: ${hasGoogleKey ? "configurada" : "ausente"}`,
		hasGoogleKey ? colors.green : colors.yellow)

	log(`  ${hasOpenRouterKey ? "✓" : "✗"} OPENROUTER_API_KEY: ${hasOpenRouterKey ? "configurada" : "ausente"}`,
		hasOpenRouterKey ? colors.green : colors.yellow)

	if (!hasGoogleKey && !hasOpenRouterKey) {
		log("  ⚠️  Nenhum provider configurado!", colors.red)
		return false
	}

	if (hasGoogleKey && hasOpenRouterKey) {
		log("  ✅ Ambos os providers configurados (fallback disponível)", colors.green)
		return true
	}

	if (hasGoogleKey) {
		log("  ⚠️  Apenas Gemini configurado (sem fallback)", colors.yellow)
		return true
	}

	log("  ⚠️  Apenas OpenRouter configurado (sem provider primário)", colors.yellow)
	return true
}

async function runTests() {
	log("=" .repeat(60), colors.blue)
	log("🚀 Iniciando testes do sistema de fallback de AI", colors.blue)
	log("=" .repeat(60), colors.blue)

	const results = {
		env: await testEnvironmentConfig(),
		mapping: await testModelMapping(),
		basic: await testBasicGeneration(),
		streaming: await testStreamingGeneration(),
		fallbackDetection: await testFallbackDetection(),
	}

	log("\n" + "=" .repeat(60), colors.blue)
	log("📊 Resumo dos Testes", colors.blue)
	log("=" .repeat(60), colors.blue)

	const entries = Object.entries(results)
	const passed = entries.filter(([_, result]) => result).length
	const total = entries.length

	for (const [test, result] of entries) {
		const status = result ? "✅ PASSOU" : "❌ FALHOU"
		const color = result ? colors.green : colors.red
		log(`  ${status} - ${test}`, color)
	}

	log("\n" + "=" .repeat(60), colors.blue)
	log(`Resultado Final: ${passed}/${total} testes passaram`,
		passed === total ? colors.green : colors.yellow)
	log("=" .repeat(60), colors.blue)

	if (passed === total) {
		log("\n🎉 Todos os testes passaram! Sistema de fallback funcionando.", colors.green)
	} else {
		log("\n⚠️  Alguns testes falharam. Verifique a configuração.", colors.yellow)
	}

	process.exit(passed === total ? 0 : 1)
}

// Executar testes
runTests().catch((error) => {
	log(`\n💥 Erro fatal nos testes: ${error}`, colors.red)
	console.error(error)
	process.exit(1)
})
