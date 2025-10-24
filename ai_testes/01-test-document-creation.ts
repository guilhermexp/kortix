/**
 * Teste 1: Criação de Documento
 *
 * Valida:
 * - Criação de documento via API
 * - Resposta contém ID
 * - Status inicial correto
 */

import { config, log, logError, logSuccess, logFailure } from "./config"

interface CreateDocumentResponse {
	id: string
	status: string
	message?: string
}

async function testDocumentCreation(): Promise<boolean> {
	console.log("\n🧪 Teste 1: Criação de Documento")
	console.log("━".repeat(50))

	try {
		// 1. Fazer login primeiro (obter session)
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
			logError("Falha no login", await loginResponse.text())
			return false
		}

		// Extrair cookies de sessão
		const cookies = loginResponse.headers.get("set-cookie") || ""
		log("Login bem-sucedido")

		// 2. Criar documento
		log("2. Criando documento...")
		const createResponse = await fetch(`${config.apiUrl}/v3/documents`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookies,
			},
			body: JSON.stringify({
				content: "Teste de documento criado via AI Testes",
				containerTags: ["ai_test"],
				metadata: {
					source: "ai_test",
					timestamp: new Date().toISOString(),
				},
			}),
		})

		if (!createResponse.ok) {
			logError("Falha ao criar documento", await createResponse.text())
			return false
		}

		const data = (await createResponse.json()) as CreateDocumentResponse
		log("Resposta:", data)

		// 3. Validar resposta
		log("3. Validando resposta...")

		if (!data.id) {
			logFailure("Documento não possui ID")
			return false
		}

		if (!data.status) {
			logFailure("Documento não possui status")
			return false
		}

		// Status esperado: queued ou processing
		const validStatuses = ["queued", "processing", "extracting", "done"]
		if (!validStatuses.includes(data.status)) {
			logFailure(`Status inválido: ${data.status}`)
			return false
		}

		logSuccess(`Documento criado com sucesso: ${data.id}`)
		logSuccess(`Status: ${data.status}`)

		return true
	} catch (error) {
		logError("Erro inesperado", error)
		return false
	}
}

// Executar se for chamado diretamente
if (import.meta.main) {
	const result = await testDocumentCreation()
	process.exit(result ? 0 : 1)
}

export { testDocumentCreation }
