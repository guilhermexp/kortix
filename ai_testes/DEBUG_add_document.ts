/**
 * Script de debug: Testar adição de documento
 * Execute: bun run DEBUG_add_document.ts
 */

async function debugAddDocument() {
	console.log("🔍 DEBUG: Testando adição de documento\n")

	// 1. Verificar se API está acessível
	console.log("1. Verificando se API está acessível...")
	try {
		const healthCheck = await fetch("http://localhost:4000/health")
		if (healthCheck.ok) {
			console.log("✅ API está respondendo")
		} else {
			console.log("❌ API retornou erro:", healthCheck.status)
			return
		}
	} catch (error) {
		console.log("❌ Não conseguiu conectar na API:", error)
		return
	}

	// 2. Fazer login
	console.log("\n2. Fazendo login...")
	const loginEmail = process.env.TEST_USER_EMAIL || "test@example.com"
	const loginPassword = process.env.TEST_USER_PASSWORD || "test123"

	let cookies = ""
	try {
		const loginResponse = await fetch(
			"http://localhost:4000/api/auth/sign-in",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: loginEmail,
					password: loginPassword,
				}),
			},
		)

		if (!loginResponse.ok) {
			const errorText = await loginResponse.text()
			console.log("❌ Login falhou:", loginResponse.status)
			console.log("Resposta:", errorText)
			console.log(
				"\n⚠️  Configure credenciais válidas em .env ou variáveis de ambiente",
			)
			return
		}

		cookies = loginResponse.headers.get("set-cookie") || ""
		console.log("✅ Login bem-sucedido")
	} catch (error) {
		console.log("❌ Erro no login:", error)
		return
	}

	// 3. Tentar adicionar documento (texto)
	console.log("\n3. Testando adição de texto...")
	try {
		const textResponse = await fetch("http://localhost:4000/v3/documents", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookies,
			},
			body: JSON.stringify({
				content: "Teste de documento - texto simples",
				containerTags: ["debug_test"],
			}),
		})

		if (!textResponse.ok) {
			const errorText = await textResponse.text()
			console.log("❌ Falha ao adicionar texto:", textResponse.status)
			console.log("Resposta de erro:", errorText)
		} else {
			const data = await textResponse.json()
			console.log("✅ Texto adicionado com sucesso:", data)
		}
	} catch (error) {
		console.log("❌ Erro ao adicionar texto:", error)
	}

	// 4. Tentar adicionar documento (URL/link)
	console.log("\n4. Testando adição de URL/link...")
	try {
		const urlResponse = await fetch("http://localhost:4000/v3/documents", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookies,
			},
			body: JSON.stringify({
				content: "https://example.com/test",
				containerTags: ["debug_test"],
			}),
		})

		if (!urlResponse.ok) {
			const errorText = await urlResponse.text()
			console.log("❌ Falha ao adicionar URL:", urlResponse.status)
			console.log("Resposta de erro:", errorText)
		} else {
			const data = await urlResponse.json()
			console.log("✅ URL adicionada com sucesso:", data)
		}
	} catch (error) {
		console.log("❌ Erro ao adicionar URL:", error)
	}

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	console.log("🔍 Debug concluído")
	console.log("\nSe algum teste falhou, veja a mensagem de erro acima")
}

debugAddDocument()
