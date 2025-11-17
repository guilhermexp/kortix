#!/usr/bin/env bun
/**
 * Test script para verificar se o SDK CLI respeita ANTHROPIC_BASE_URL
 *
 * Testa:
 * 1. Se o SDK usa a base URL customizada (MiniMax)
 * 2. Se consegue fazer chamadas para APIs alternativas
 */

import { query } from "@anthropic-ai/claude-agent-sdk"

async function testProviderSwitch() {
	console.log("\n=== TESTE: SDK CLI com Provider Customizado ===\n")

	// Configurar MiniMax
	const MINIMAX_CONFIG = {
		apiKey: process.env.ANTHROPIC_API_KEY || "",
		baseURL:
			process.env.ANTHROPIC_BASE_URL || "https://api.minimax.io/anthropic",
		model: process.env.CHAT_MODEL || "MiniMax-M2",
	}

	console.log("Configuração:")
	console.log("- Base URL:", MINIMAX_CONFIG.baseURL)
	console.log("- Modelo:", MINIMAX_CONFIG.model)
	console.log("- API Key:", MINIMAX_CONFIG.apiKey.substring(0, 20) + "...")
	console.log()

	// Garantir que env vars estão setadas
	process.env.ANTHROPIC_API_KEY = MINIMAX_CONFIG.apiKey
	process.env.ANTHROPIC_BASE_URL = MINIMAX_CONFIG.baseURL

	console.log("Variáveis de ambiente setadas:")
	console.log("- ANTHROPIC_BASE_URL:", process.env.ANTHROPIC_BASE_URL)
	console.log()

	// Criar prompt stream
	async function* promptGenerator() {
		yield {
			type: "user" as const,
			message: {
				role: "user" as const,
				content: [
					{ type: "text" as const, text: "Diga apenas 'olá' em uma palavra" },
				],
			},
		}
	}

	try {
		console.log("Iniciando chamada ao SDK...")
		console.log()

		const agentIterator = query({
			prompt: promptGenerator(),
			options: {
				model: MINIMAX_CONFIG.model,
				maxTurns: 1,
				permissionMode: "bypassPermissions",
				allowDangerouslySkipPermissions: true,
				verbose: true,
			},
		})

		let eventCount = 0
		let responseText = ""

		for await (const event of agentIterator) {
			eventCount++

			if (event && typeof event === "object") {
				const typed = event as any

				// Log eventos relevantes
				if (typed.type === "system") {
					console.log(
						`[Evento ${eventCount}] SYSTEM:`,
						JSON.stringify(typed, null, 2),
					)
				} else if (typed.type === "assistant") {
					console.log(`[Evento ${eventCount}] ASSISTANT:`)
					if (typed.message?.content) {
						for (const block of typed.message.content) {
							if (block.type === "text") {
								responseText += block.text
								console.log("  Texto:", block.text)
							}
						}
					}
				} else if (typed.type?.includes("error")) {
					console.log(
						`[Evento ${eventCount}] ERROR:`,
						JSON.stringify(typed, null, 2),
					)
				}
			}
		}

		console.log()
		console.log("=== RESULTADO ===")
		console.log("Total de eventos:", eventCount)
		console.log("Resposta completa:", responseText || "(vazio)")
		console.log()

		if (responseText) {
			console.log(
				"✅ SUCESSO: SDK conseguiu fazer chamada com base URL customizada!",
			)
			console.log("   O provider MiniMax respondeu corretamente.")
		} else {
			console.log("⚠️  AVISO: Não recebeu resposta de texto")
		}
	} catch (error) {
		console.error("\n❌ ERRO:", error)
		console.error()

		if (error instanceof Error) {
			console.error("Mensagem:", error.message)
			console.error("Stack:", error.stack)
		}

		console.log("\n🔍 ANÁLISE:")
		console.log("Se o erro mencionar 'authentication' ou '401':")
		console.log("  → SDK está tentando usar a base URL customizada ✅")
		console.log("  → Mas pode haver problema com a API key")
		console.log()
		console.log("Se o erro mencionar 'anthropic.com':")
		console.log("  → SDK NÃO está respeitando ANTHROPIC_BASE_URL ❌")
		console.log("  → Está hardcoded para usar API oficial da Anthropic")
	}
}

testProviderSwitch()
