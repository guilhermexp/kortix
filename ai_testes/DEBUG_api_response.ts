/**
 * Debug: Verificar se API retorna campo 'raw' com ogImage
 * Execute: bun run DEBUG_api_response.ts
 */

async function debugApiResponse() {
	console.log("🔍 DEBUG: Verificando resposta da API\n")

	// 1. Fazer login
	console.log("1. Fazendo login...")
	const loginEmail = process.env.TEST_USER_EMAIL || "test@example.com"
	const loginPassword = process.env.TEST_USER_PASSWORD || "test123"

	let cookies = ""
	try {
		const loginResponse = await fetch("http://localhost:4000/api/auth/sign-in", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: loginEmail,
				password: loginPassword,
			}),
		})

		if (!loginResponse.ok) {
			console.log("❌ Login falhou:", loginResponse.status)
			return
		}

		cookies = loginResponse.headers.get("set-cookie") || ""
		console.log("✅ Login bem-sucedido\n")
	} catch (error) {
		console.log("❌ Erro no login:", error)
		return
	}

	// 2. Buscar documentos
	console.log("2. Buscando documentos com memórias...")
	try {
		const response = await fetch(
			"http://localhost:4000/v3/documents?page=1&limit=5",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: cookies,
				},
				body: JSON.stringify({}),
			},
		)

		if (!response.ok) {
			console.log("❌ Erro ao buscar documentos:", response.status)
			const errorText = await response.text()
			console.log("Resposta:", errorText)
			return
		}

		const data = await response.json()
		console.log("✅ Documentos recebidos:", data.documents?.length || 0)
		console.log()

		// 3. Verificar se supermemory.ai está na resposta
		const supermemoryDoc = data.documents?.find((doc: any) =>
			doc.url?.includes("supermemory.ai"),
		)

		if (!supermemoryDoc) {
			console.log("⚠️  supermemory.ai não encontrado na resposta")
			console.log("\nDocumentos disponíveis:")
			for (const doc of data.documents || []) {
				console.log(`- ${doc.title || "Untitled"}: ${doc.url || "no URL"}`)
			}
			return
		}

		console.log("✅ supermemory.ai encontrado!")
		console.log("\n3. Verificando campo 'raw'...")
		console.log("━".repeat(50))

		// Verificar se raw existe
		if (!supermemoryDoc.raw) {
			console.log("❌ Campo 'raw' está NULL ou não existe na resposta!")
			console.log("\nCampos disponíveis no documento:")
			console.log(Object.keys(supermemoryDoc).join(", "))
			return
		}

		console.log("✅ Campo 'raw' existe")

		// Verificar raw.extraction
		if (!supermemoryDoc.raw.extraction) {
			console.log("❌ Campo 'raw.extraction' não existe!")
			console.log("\nConteúdo de raw:")
			console.log(JSON.stringify(supermemoryDoc.raw, null, 2))
			return
		}

		console.log("✅ Campo 'raw.extraction' existe")

		// Verificar ogImage
		const ogImage = supermemoryDoc.raw.extraction.ogImage
		if (!ogImage) {
			console.log("❌ Campo 'raw.extraction.ogImage' não existe ou é null!")
			console.log("\nConteúdo de raw.extraction:")
			console.log(JSON.stringify(supermemoryDoc.raw.extraction, null, 2))
			return
		}

		console.log("✅ Campo 'raw.extraction.ogImage' existe!")
		console.log("\n4. Detalhes da preview:")
		console.log("━".repeat(50))
		console.log(`URL da imagem: ${ogImage}`)
		console.log(`Meta tags:`, supermemoryDoc.raw.extraction.metaTags || "N/A")

		console.log("\n━".repeat(50))
		console.log("✅ API está retornando ogImage corretamente!")
		console.log("\nSe a preview não aparece no frontend, o problema é:")
		console.log("1. Frontend não está lendo raw.extraction.ogImage")
		console.log("2. Erro ao renderizar a imagem")
		console.log("3. Erro de CORS ao carregar a imagem")
		console.log(
			"\nAbra o DevTools do navegador e veja se há erros no console.",
		)
	} catch (error) {
		console.log("❌ Erro ao buscar documentos:", error)
	}
}

debugApiResponse()
