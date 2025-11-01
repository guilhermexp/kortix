import Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "../env"
import { ENHANCED_SYSTEM_PROMPT } from "../prompts/chat"
import { searchDocuments } from "../routes/search"
import { getProviderConfig, getDefaultProvider, type ProviderId } from "../config/providers"

export type AgentMessage = {
	role: "user" | "assistant"
	content: string
}

export type AgentContextOptions = {
	containerTags?: string[]
	scopedDocumentIds?: string[]
}

export type ClaudeDirectOptions = {
	messages: AgentMessage[]
	client: SupabaseClient
	orgId: string
	systemPrompt?: string
	model?: string
	provider?: ProviderId // AI provider to use (glm or minimax)
	context?: AgentContextOptions
	maxTurns?: number
}

/**
 * Busca documentos no banco usando o serviço de search
 */
async function handleSearchDatabase(
	client: SupabaseClient,
	orgId: string,
	query: string,
	context?: AgentContextOptions
): Promise<string> {
	try {
		const results = await searchDocuments(client, orgId, {
			q: query,
			limit: 10,
			includeSummary: true,
			includeFullDocs: false,
			chunkThreshold: 0.1,
			documentThreshold: 0.1,
			containerTags: context?.containerTags,
			scopedDocumentIds: context?.scopedDocumentIds,
		})

		if (!results || results.length === 0) {
			return "Nenhum documento encontrado para a busca."
		}

		// Formatar resultados para o Claude
		const formatted = results
			.slice(0, 10)
			.map((doc, i) => {
				return `[${i + 1}] ${doc.title || "Sem título"}
Relevância: ${(doc.score * 100).toFixed(1)}%
Conteúdo: ${doc.content?.slice(0, 300) || "Sem conteúdo"}...`
			})
			.join("\n\n")

		return `Encontrados ${results.length} documentos:\n\n${formatted}`
	} catch (error) {
		console.error("Error searching database:", error)
		return `Erro ao buscar documentos: ${error instanceof Error ? error.message : "Erro desconhecido"}`
	}
}

/**
 * Executa Claude com tools usando API direta (não CLI)
 */
export async function executeClaudeDirect({
	messages,
	client,
	orgId,
	systemPrompt,
	model,
	provider,
	context,
	maxTurns = 10,
}: ClaudeDirectOptions): Promise<{ text: string; toolCalls: number }> {
	// Get provider configuration
	const providerId = provider || getDefaultProvider()
	const providerConfig = getProviderConfig(providerId)

	console.log("[executeClaudeDirect] Using provider:", providerConfig.name, `(${providerId})`)
	console.log("[executeClaudeDirect] Base URL:", providerConfig.baseURL)

	const anthropic = new Anthropic({
		apiKey: providerConfig.apiKey,
		baseURL: providerConfig.baseURL,
	})

	// Definir tool searchDatabase
	const tools: Anthropic.Tool[] = [
		{
			name: "searchDatabase",
			description:
				"Busca documentos e memórias no banco de dados do usuário. Use quando precisar encontrar informações salvas.",
			input_schema: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "Texto de busca",
					},
				},
				required: ["query"],
			},
		},
	]

	// Converter mensagens para formato Anthropic
	const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg) => ({
		role: msg.role === "assistant" ? "assistant" : "user",
		content: msg.content,
	}))

	let currentMessages = [...anthropicMessages]
	let toolCallCount = 0
	let turn = 0

	// Loop de agentic turns
	while (turn < maxTurns) {
		turn++

		const response = await anthropic.messages.create({
			model: model || providerConfig.models.balanced,
			max_tokens: 4096,
			system: systemPrompt || ENHANCED_SYSTEM_PROMPT,
			messages: currentMessages,
			tools,
		})

		// Se não parou por tool use, retorna resposta final
		if (response.stop_reason !== "tool_use") {
			const text = response.content
				.filter((block) => block.type === "text")
				.map((block) => (block as Anthropic.TextBlock).text)
				.join("")
			return { text, toolCalls: toolCallCount }
		}

		// Processar tool calls
		const toolUseBlocks = response.content.filter(
			(block) => block.type === "tool_use"
		) as Anthropic.ToolUseBlock[]

		if (toolUseBlocks.length === 0) {
			// Não tem tool use, mas stop_reason era tool_use? Retorna texto
			const text = response.content
				.filter((block) => block.type === "text")
				.map((block) => (block as Anthropic.TextBlock).text)
				.join("")
			return { text, toolCalls: toolCallCount }
		}

		// Adicionar resposta do assistant à conversa
		currentMessages.push({
			role: "assistant",
			content: response.content,
		})

		// Executar tools e adicionar respostas
		const toolResults: Anthropic.ToolResultBlockParam[] = []

		for (const toolUse of toolUseBlocks) {
			toolCallCount++

			if (toolUse.name === "searchDatabase") {
				const input = toolUse.input as { query: string }
				const result = await handleSearchDatabase(
					client,
					orgId,
					input.query,
					context
				)

				toolResults.push({
					type: "tool_result",
					tool_use_id: toolUse.id,
					content: result,
				})
			}
		}

		// Adicionar tool results à conversa
		currentMessages.push({
			role: "user",
			content: toolResults,
		})
	}

	// Atingiu max turns, fazer chamada final sem tools
	const finalResponse = await anthropic.messages.create({
		model: model || providerConfig.models.balanced,
		max_tokens: 4096,
		system: systemPrompt || ENHANCED_SYSTEM_PROMPT,
		messages: currentMessages,
		// Sem tools para forçar resposta final
	})

	const text = finalResponse.content
		.filter((block) => block.type === "text")
		.map((block) => (block as Anthropic.TextBlock).text)
		.join("")

	return { text, toolCalls: toolCallCount }
}
