/**
 * Teste 2: Listagem de Documentos com Memórias
 *
 * Valida:
 * - Listagem retorna documentos
 * - Memórias incluídas na resposta
 * - Campo 'memory' presente (não 'content')
 * - Campo 'documentId' presente (correção aplicada)
 */

import { config, log, logError, logFailure, logSuccess } from "./config"

interface MemoryEntry {
	id: string
	documentId?: string // Campo adicionado nas correções
	memory: string // API usa 'memory', não 'content'
	metadata?: Record<string, unknown>
	createdAt: string
	updatedAt: string
}

interface Document {
	id: string
	status: string
	memoryEntries?: MemoryEntry[]
}

interface ListResponse {
	documents: Document[]
	totalCount: number
}

async function testDocumentList(): Promise<boolean> {
	console.log("\n🧪 Teste 2: Listagem de Documentos com Memórias")
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

		// 2. Listar documentos
		log("2. Listando documentos...")
		const listResponse = await fetch(
			`${config.apiUrl}/v3/documents/list?limit=10`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: cookies,
				},
				body: JSON.stringify({}),
			},
		)

		if (!listResponse.ok) {
			logError("Falha ao listar documentos", await listResponse.text())
			return false
		}

		const data = (await listResponse.json()) as ListResponse
		log(`Documentos encontrados: ${data.documents?.length || 0}`)

		// 3. Validar resposta
		log("3. Validando resposta...")

		if (!Array.isArray(data.documents)) {
			logFailure("Resposta não contém array de documentos")
			return false
		}

		if (data.documents.length === 0) {
			logFailure("Nenhum documento encontrado (crie um documento primeiro)")
			return false
		}

		// 4. Validar memórias
		log("4. Validando memórias...")
		let memoriesFound = 0
		let memoriesWithDocumentId = 0
		let memoriesWithMemoryField = 0

		for (const doc of data.documents) {
			if (doc.memoryEntries && doc.memoryEntries.length > 0) {
				memoriesFound += doc.memoryEntries.length

				for (const memory of doc.memoryEntries) {
					// Verificar campo 'memory' (não 'content')
					if ("memory" in memory) {
						memoriesWithMemoryField++
					} else {
						logFailure(
							`Memória ${memory.id} não possui campo 'memory' (tem 'content'?)`,
						)
					}

					// Verificar campo 'documentId' (adicionado nas correções)
					if ("documentId" in memory) {
						memoriesWithDocumentId++
					}
				}
			}
		}

		log(`Memórias encontradas: ${memoriesFound}`)
		log(
			`Memórias com campo 'memory': ${memoriesWithMemoryField}/${memoriesFound}`,
		)
		log(
			`Memórias com campo 'documentId': ${memoriesWithDocumentId}/${memoriesFound}`,
		)

		// Validar que TODAS as memórias têm os campos corretos
		if (memoriesFound > 0) {
			if (memoriesWithMemoryField !== memoriesFound) {
				logFailure("Algumas memórias não têm campo 'memory'")
				return false
			}

			if (memoriesWithDocumentId !== memoriesFound) {
				logFailure(
					"Algumas memórias não têm campo 'documentId' (correção não aplicada?)",
				)
				return false
			}
		}

		logSuccess("Listagem validada com sucesso")
		logSuccess(`✅ Campo 'memory' presente em todas as memórias`)
		logSuccess(`✅ Campo 'documentId' presente em todas as memórias`)

		return true
	} catch (error) {
		logError("Erro inesperado", error)
		return false
	}
}

// Executar se for chamado diretamente
if (import.meta.main) {
	const result = await testDocumentList()
	process.exit(result ? 0 : 1)
}

export { testDocumentList }
