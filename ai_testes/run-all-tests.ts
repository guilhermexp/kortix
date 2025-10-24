/**
 * Runner Principal - Executa todos os testes
 */

import { testDocumentCreation } from "./01-test-document-creation"
import { testDocumentList } from "./02-test-document-list"
import { testSchemaTransformations } from "./03-test-schema-transformations"
import { testAtomicFunction } from "./04-test-atomic-function"
import { testSearch } from "./05-test-search"

interface TestResult {
	name: string
	passed: boolean
	duration: number
}

async function runAllTests() {
	console.log("\n")
	console.log("🧪 Executando Testes do Supermemory")
	console.log("━".repeat(50))
	console.log("")

	const results: TestResult[] = []

	// Lista de testes
	const tests = [
		{ name: "Criação de Documento", fn: testDocumentCreation },
		{ name: "Listagem com Memórias", fn: testDocumentList },
		{ name: "Transformações de Schema", fn: testSchemaTransformations },
		{ name: "Função Atômica", fn: testAtomicFunction },
		{ name: "Busca", fn: testSearch },
	]

	// Executar cada teste
	for (const test of tests) {
		const startTime = Date.now()
		try {
			const passed = await test.fn()
			const duration = Date.now() - startTime
			results.push({ name: test.name, passed, duration })
		} catch (error) {
			const duration = Date.now() - startTime
			console.error(`\n❌ Erro fatal no teste "${test.name}":`, error)
			results.push({ name: test.name, passed: false, duration })
		}
	}

	// Exibir resumo
	console.log("\n")
	console.log("━".repeat(50))
	console.log("📊 RESUMO DOS TESTES")
	console.log("━".repeat(50))

	for (let i = 0; i < results.length; i++) {
		const result = results[i]
		const status = result.passed ? "✅ PASSOU" : "❌ FALHOU"
		const duration = `(${result.duration}ms)`
		console.log(`${i + 1}. ${result.name} - ${status} ${duration}`)
	}

	console.log("━".repeat(50))

	const passedCount = results.filter((r) => r.passed).length
	const totalCount = results.length
	const allPassed = passedCount === totalCount

	if (allPassed) {
		console.log(`\n🎉 Todos os testes passaram! (${passedCount}/${totalCount})`)
		console.log("")
	} else {
		console.log(
			`\n⚠️  Alguns testes falharam (${passedCount}/${totalCount} passaram)`,
		)
		console.log("")
	}

	// Exit code
	process.exit(allPassed ? 0 : 1)
}

// Executar
runAllTests()
