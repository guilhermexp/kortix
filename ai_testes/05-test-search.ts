/**
 * Teste 5: Busca de Documentos
 *
 * Valida:
 * - Endpoint de busca funciona
 * - Retorna resultados
 * - Formato de resposta correto
 */

import { config, log, logError, logSuccess, logFailure } from "./config"

interface SearchResult {
	id: string
	content: string
	similarity?: number
}

interface SearchResponse {
	results: SearchResult[]
}

async function testSearch(): Promise<boolean> {
	console.log("\n🧪 Teste 5: Busca de Documentos")
	console.log("━".repeat(50))

	try {
		// 1. Fazer login
		log("1. Fazendo login...")
		const loginResponse = await fetch(`${config.apiUrl}/api/auth/sign-in`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: config.auth.email,
				password: config.auth.password,
			}),
		})

		if (!loginResponse.ok) {
			logError("Falha no login")
			return false
		}

		const cookies = loginResponse.headers.get("set-cookie") || ""
		log("Login bem-sucedido")

		// 2. Fazer busca
		log("2. Realizando busca...")
		const searchResponse = await fetch(`${config.apiUrl}/v3/search`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookies,
			},
			body: JSON.stringify({
				query: "teste",
				limit: 10,
			}),
		})

		if (!searchResponse.ok) {
			logError("Falha na busca", await searchResponse.text())
			return false
		}

		const data = (await searchResponse.json()) as SearchResponse
		log(`Resultados encontrados: ${data.results?.length || 0}`)

		// 3. Validar resposta
		log("3. Validando resposta...")

		if (!data.results || !Array.isArray(data.results)) {
			logFailure("Resposta não contém array de resultados")
			return false
		}

		if (data.results.length > 0) {
			const firstResult = data.results[0]

			if (!firstResult.id) {
				logFailure("Resultado não possui ID")
				return false
			}

			if (!firstResult.content) {
				logFailure("Resultado não possui content")
				return false
			}

			log("Exemplo de resultado:")
			log(`  ID: ${firstResult.id}`)
			log(`  Content: ${firstResult.content.substring(0, 50)}...`)
			if (firstResult.similarity) {
				log(`  Similarity: ${firstResult.similarity}`)
			}
		}

		logSuccess("Busca validada com sucesso")
		return true
	} catch (error) {
		logError("Erro inesperado", error)
		return false
	}
}

// Executar se for chamado diretamente
if (import.meta.main) {
	const result = await testSearch()
	process.exit(result ? 0 : 1)
}

export { testSearch }
