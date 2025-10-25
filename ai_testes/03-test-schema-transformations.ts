/**
 * Teste 3: Transformações de Schema
 *
 * Valida:
 * - Função memoryDBtoAPI transforma corretamente
 * - Função memoryAPItoInsert transforma corretamente
 * - Campo content → memory
 * - Campo memory → content
 */

import {
	type MemoryEntry,
	type MemoryEntryDB,
	memoryAPItoInsert,
	memoryDBtoAPI,
} from "../packages/validation/schemas"
import { log, logFailure, logSuccess } from "./config"

async function testSchemaTransformations(): Promise<boolean> {
	console.log("\n🧪 Teste 3: Transformações de Schema")
	console.log("━".repeat(50))

	try {
		// 1. Testar memoryDBtoAPI (content → memory)
		log("1. Testando memoryDBtoAPI (content → memory)...")

		const dbMemory: MemoryEntryDB = {
			id: "test-id-123",
			documentId: "doc-id-456",
			spaceId: "space-id-789",
			orgId: "org-id-000",
			userId: "user-id-111",
			content: "Este é o conteúdo do banco de dados", // Campo do banco
			metadata: { source: "test" },
			memoryEmbedding: null,
			memoryEmbeddingModel: null,
			memoryEmbeddingNew: null,
			memoryEmbeddingNewModel: null,
			version: 1,
			isLatest: true,
			sourceCount: 1,
			isInference: false,
			isForgotten: false,
			forgetAfter: null,
			forgetReason: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		const apiMemory = memoryDBtoAPI(dbMemory)

		// Validar transformação
		if (!("memory" in apiMemory)) {
			logFailure("Campo 'memory' não existe no resultado da transformação")
			return false
		}

		if (apiMemory.memory !== dbMemory.content) {
			logFailure("Campo 'memory' não contém o valor correto de 'content'")
			return false
		}

		if (apiMemory.documentId !== dbMemory.documentId) {
			logFailure("Campo 'documentId' não foi copiado corretamente")
			return false
		}

		logSuccess("memoryDBtoAPI funciona corretamente")
		log(`  content: "${dbMemory.content}"`)
		log(`  memory:  "${apiMemory.memory}"`)

		// 2. Testar memoryAPItoInsert (memory → content)
		log("\n2. Testando memoryAPItoInsert (memory → content)...")

		const apiInput: Partial<MemoryEntry> = {
			memory: "Este é o conteúdo da API", // Campo da API
			documentId: "doc-id-456",
			spaceId: "space-id-789",
			orgId: "org-id-000",
			userId: "user-id-111",
			metadata: { source: "api" },
		}

		const dbInsert = memoryAPItoInsert(apiInput)

		// Validar transformação
		if (!("content" in dbInsert)) {
			logFailure("Campo 'content' não existe no resultado da transformação")
			return false
		}

		if ("memory" in dbInsert) {
			logFailure("Campo 'memory' ainda existe (deveria ser removido)")
			return false
		}

		if (dbInsert.content !== apiInput.memory) {
			logFailure("Campo 'content' não contém o valor correto de 'memory'")
			return false
		}

		logSuccess("memoryAPItoInsert funciona corretamente")
		log(`  memory:  "${apiInput.memory}"`)
		log(`  content: "${dbInsert.content}"`)

		// 3. Teste round-trip (DB → API → DB)
		log("\n3. Testando round-trip (DB → API → DB)...")

		const originalDB: MemoryEntryDB = {
			id: "round-trip-test",
			documentId: "doc-round-trip",
			spaceId: "space-round-trip",
			orgId: "org-round-trip",
			userId: "user-round-trip",
			content: "Conteúdo original do banco",
			metadata: { test: "round-trip" },
			memoryEmbedding: null,
			memoryEmbeddingModel: null,
			memoryEmbeddingNew: null,
			memoryEmbeddingNewModel: null,
			version: 1,
			isLatest: true,
			sourceCount: 1,
			isInference: false,
			isForgotten: false,
			forgetAfter: null,
			forgetReason: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		const api = memoryDBtoAPI(originalDB)
		const backToDB = memoryAPItoInsert(api)

		if (backToDB.content !== originalDB.content) {
			logFailure("Round-trip falhou: conteúdo diferente")
			log(`  Original: "${originalDB.content}"`)
			log(`  Final:    "${backToDB.content}"`)
			return false
		}

		logSuccess("Round-trip funciona corretamente")
		log(`  DB → API → DB: "${originalDB.content}"`)

		logSuccess("\n✅ Todas as transformações funcionando corretamente")
		return true
	} catch (error) {
		logFailure("Erro inesperado nas transformações")
		console.error(error)
		return false
	}
}

// Executar se for chamado diretamente
if (import.meta.main) {
	const result = await testSchemaTransformations()
	process.exit(result ? 0 : 1)
}

export { testSchemaTransformations }
