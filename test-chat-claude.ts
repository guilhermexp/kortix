#!/usr/bin/env bun

/**
 * Script de teste do chat com Claude Agent SDK
 *
 * Testa se o endpoint /chat/v2 está funcionando corretamente
 * e se o Claude Agent responde usando as tools MCP
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000"
const TEST_EMAIL = process.env.TEST_EMAIL || "admin@local.host"
const TEST_PASSWORD = process.env.TEST_PASSWORD || "admin123"

interface TestCase {
	name: string
	message: string
	shouldUseTool: boolean
}

let sessionCookie = ""

const testCases: TestCase[] = [
	{
		name: "Teste 1: Saudação simples",
		message: "Olá! Como você está?",
		shouldUseTool: false,
	},
	{
		name: "Teste 2: Busca no banco (deve usar searchDatabase tool)",
		message: "Busque documentos sobre inteligência artificial",
		shouldUseTool: true,
	},
	{
		name: "Teste 3: Pergunta sobre memórias",
		message: "O que eu tenho salvo sobre machine learning?",
		shouldUseTool: true,
	},
]

async function testChat(testCase: TestCase) {
	console.log(`\n${"=".repeat(60)}`)
	console.log(`📝 ${testCase.name}`)
	console.log(`${"=".repeat(60)}`)
	console.log(`💬 Mensagem: "${testCase.message}"`)
	console.log(`🔧 Espera usar tool: ${testCase.shouldUseTool ? "SIM" : "NÃO"}`)
	console.log()

	try {
		const startTime = Date.now()

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		}

		if (sessionCookie) {
			headers["Cookie"] = sessionCookie
		}

		const response = await fetch(`${BACKEND_URL}/chat/v2`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				messages: [
					{
						role: "user",
						content: testCase.message,
					},
				],
			}),
		})

		const duration = Date.now() - startTime

		if (!response.ok) {
			console.error(`❌ Erro HTTP: ${response.status} ${response.statusText}`)
			const errorText = await response.text()
			console.error("📄 Resposta:", errorText.slice(0, 500))
			return false
		}

		const contentType = response.headers.get("content-type")
		console.log(`📦 Content-Type: ${contentType}`)

		let data: any

		if (contentType?.includes("application/json")) {
			data = await response.json()
			console.log(`✅ Resposta JSON recebida (${duration}ms)`)
			console.log()

			// Exibir resposta
			if (data.message?.content) {
				console.log("🤖 Claude respondeu:")
				console.log("─────────────────────────────────────────────────")
				console.log(data.message.content.slice(0, 300))
				if (data.message.content.length > 300) {
					console.log(
						`... (${data.message.content.length} caracteres no total)`,
					)
				}
				console.log("─────────────────────────────────────────────────")
			}

			// Verificar se usou tools
			if (data.events && Array.isArray(data.events)) {
				const toolEvents = data.events.filter(
					(e: any) => e.type === "tool_use" || e.tool_name,
				)
				console.log()
				console.log(`🔧 Tools usadas: ${toolEvents.length}`)
				if (toolEvents.length > 0) {
					toolEvents.forEach((e: any) => {
						console.log(`   - ${e.tool_name || e.name || "tool desconhecida"}`)
					})
				}

				if (testCase.shouldUseTool && toolEvents.length === 0) {
					console.warn("⚠️  AVISO: Esperava usar tool, mas nenhuma foi usada")
				} else if (!testCase.shouldUseTool && toolEvents.length > 0) {
					console.warn(
						`⚠️  AVISO: Não esperava usar tool, mas ${toolEvents.length} foram usadas`,
					)
				}
			}

			console.log()
			console.log(`✅ TESTE PASSOU (${duration}ms)`)
			return true
		}
		if (contentType?.includes("text/plain")) {
			// Streaming response
			const text = await response.text()
			console.log(`✅ Resposta texto/streaming recebida (${duration}ms)`)
			console.log()
			console.log("🤖 Claude respondeu:")
			console.log("─────────────────────────────────────────────────")
			console.log(text.slice(0, 300))
			if (text.length > 300) {
				console.log(`... (${text.length} caracteres no total)`)
			}
			console.log("─────────────────────────────────────────────────")
			console.log()
			console.log(`✅ TESTE PASSOU (${duration}ms)`)
			return true
		}
		console.error(`❌ Content-Type inesperado: ${contentType}`)
		return false
	} catch (error) {
		console.error("❌ ERRO:", error instanceof Error ? error.message : error)
		if (error instanceof Error && error.stack) {
			console.error("📚 Stack:", error.stack.split("\n").slice(0, 3).join("\n"))
		}
		return false
	}
}

async function signUp() {
	console.log("👤 Criando usuário de teste...")
	console.log(`📧 Email: ${TEST_EMAIL}`)

	try {
		const response = await fetch(`${BACKEND_URL}/api/auth/sign-up`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: TEST_EMAIL,
				password: TEST_PASSWORD,
			}),
		})

		if (response.ok) {
			console.log("✅ Usuário criado com sucesso!")
			return true
		}
		if (response.status === 400) {
			console.log("ℹ️  Usuário já existe, tentando login...")
			return true
		}
		console.warn(`⚠️  Erro ao criar usuário: ${response.status}`)
		return true // Continua tentando login
	} catch (error) {
		console.warn("⚠️  Erro no sign-up:", error)
		return true // Continua tentando login
	}
}

async function login() {
	console.log("🔐 Fazendo login...")
	console.log(`📧 Email: ${TEST_EMAIL}`)

	try {
		const response = await fetch(`${BACKEND_URL}/api/auth/sign-in`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: TEST_EMAIL,
				password: TEST_PASSWORD,
			}),
		})

		if (!response.ok) {
			console.error(`❌ Login falhou: ${response.status}`)
			const error = await response.text()
			console.error("📄 Resposta:", error.slice(0, 200))
			console.error()
			console.error("💡 Use suas credenciais:")
			console.error(
				"   TEST_EMAIL=seu@email TEST_PASSWORD=senha bun test-chat-claude.ts",
			)
			return false
		}

		// Capturar cookie de sessão
		const setCookie = response.headers.get("set-cookie")
		if (setCookie) {
			sessionCookie = setCookie.split(";")[0]
			console.log("✅ Login realizado com sucesso!")
			console.log(`🍪 Cookie: ${sessionCookie.slice(0, 40)}...`)
			return true
		}
		console.warn("⚠️  Login OK mas sem cookie de sessão")
		return true
	} catch (error) {
		console.error("❌ Erro no login:", error)
		return false
	}
}

async function checkHealth() {
	console.log("🏥 Verificando saúde do servidor...")
	console.log(`🌐 URL: ${BACKEND_URL}`)

	try {
		const response = await fetch(`${BACKEND_URL}/health`, {
			method: "GET",
		})

		if (response.ok) {
			console.log("✅ Servidor está rodando!")
			return true
		}
		console.log(`⚠️  Servidor respondeu com status: ${response.status}`)
		console.log("💡 Tentando mesmo assim...")
		return true // Continua mesmo se não tiver endpoint /health
	} catch (error) {
		console.error(`❌ Não foi possível conectar ao servidor em ${BACKEND_URL}`)
		console.error("💡 Certifique-se de que o servidor está rodando:")
		console.error("   cd apps/api && bun run dev")
		return false
	}
}

async function main() {
	console.log(`
╔═══════════════════════════════════════════════════════════╗
║     🧪 TESTE DO CHAT COM CLAUDE AGENT SDK                ║
╚═══════════════════════════════════════════════════════════╝
`)

	// 1. Verificar servidor
	const serverOk = await checkHealth()
	if (!serverOk) {
		process.exit(1)
	}

	console.log()

	// 2. Criar usuário (se não existir)
	await signUp()

	console.log()

	// 3. Fazer login
	const loginOk = await login()
	if (!loginOk) {
		process.exit(1)
	}

	console.log()

	// 4. Executar testes
	let passed = 0
	let failed = 0

	for (const testCase of testCases) {
		const result = await testChat(testCase)
		if (result) {
			passed++
		} else {
			failed++
		}

		// Aguardar um pouco entre testes
		if (testCase !== testCases[testCases.length - 1]) {
			await new Promise((resolve) => setTimeout(resolve, 1000))
		}
	}

	// 5. Resumo
	console.log()
	console.log(`${"=".repeat(60)}`)
	console.log("📊 RESUMO DOS TESTES")
	console.log(`${"=".repeat(60)}`)
	console.log(`✅ Passou: ${passed}/${testCases.length}`)
	console.log(`❌ Falhou: ${failed}/${testCases.length}`)
	console.log()

	if (failed === 0) {
		console.log("🎉 TODOS OS TESTES PASSARAM!")
		console.log("✨ O chat com Claude Agent SDK está funcionando!")
		process.exit(0)
	} else {
		console.log("⚠️  ALGUNS TESTES FALHARAM")
		console.log("💡 Verifique os logs acima para mais detalhes")
		process.exit(1)
	}
}

main()
