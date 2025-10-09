import { GoogleGenerativeAI } from "@google/generative-ai"
import { GoogleAIFileManager } from "@google/generative-ai/server"
import { env } from "../env"
import { aiClient } from "./ai-provider"

const POLL_INTERVAL_MS = 1_000
const MAX_POLL_ATTEMPTS = 30

// FileManager só funciona com Gemini diretamente
const googleClient = env.GOOGLE_API_KEY
	? new GoogleGenerativeAI(env.GOOGLE_API_KEY)
	: null

const fileManager = env.GOOGLE_API_KEY
	? new GoogleAIFileManager(env.GOOGLE_API_KEY)
	: null

type UploadSummaryResult = {
	text: string
	metadata: Record<string, unknown>
}

function ensureGeminiConfigured() {
	if (!googleClient || !fileManager) {
		throw new Error(
			"Google Generative AI is not configured. Set GOOGLE_API_KEY.",
		)
	}

	return {
		client: googleClient,
		fileManager,
	}
}

async function waitForFileReady(fileName: string) {
	const { fileManager: manager } = ensureGeminiConfigured()
	for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
		const file = await manager.getFile(fileName)
		if (!file?.state) {
			throw new Error("Failed to fetch uploaded file metadata.")
		}
		if (file.state === "ACTIVE") {
			return file
		}
		if (file.state === "FAILED" || file.state === "STATE_UNSPECIFIED") {
			throw new Error(`Uploaded file processing failed: ${file.state}`)
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
	}
	throw new Error("Timeout while waiting for Gemini to process uploaded file")
}

function buildPrompt(mimeType: string, filename?: string) {
	const lowerMime = mimeType.toLowerCase()
	if (lowerMime.startsWith("image/")) {
		return [
			"Você é um assistente que descreve imagens para o Supermemory.",
			"Forneça uma descrição detalhada da imagem, destaque objetos, texto presente (realize OCR) e o contexto geral.",
			"Liste insights importantes em bullet points.",
			filename ? `Nome do arquivo: ${filename}` : "",
		]
			.filter(Boolean)
			.join("\n\n")
	}

	if (lowerMime.startsWith("audio/")) {
		return [
			"Você é um assistente que analisa arquivos de áudio para o Supermemory.",
			"Gere um resumo detalhado do conteúdo, incluindo tópicos principais e pontos de ação.",
			"Transcreva trechos importantes e identifique quem fala quando possível.",
			filename ? `Nome do arquivo: ${filename}` : "",
		]
			.filter(Boolean)
			.join("\n\n")
	}

	if (lowerMime.startsWith("video/")) {
		return [
			"Você é um assistente que analisa vídeos para o Supermemory.",
			"Descreva a narrativa do vídeo, identifique personagens, ações relevantes e contexto.",
			"Forneça também bullet points com eventos importantes e quaisquer instruções/diálogos marcantes.",
			filename ? `Nome do arquivo: ${filename}` : "",
		]
			.filter(Boolean)
			.join("\n\n")
	}

	return [
		"Você é um assistente que processa documentos para o Supermemory.",
		"Extraia o conteúdo principal em Markdown estruturado com títulos, parágrafos e listas.",
		"Inclua um resumo inicial (3-5 frases) e, em seguida, destaque pontos-chave em bullet points.",
		filename ? `Nome do arquivo: ${filename}` : "",
	]
		.filter(Boolean)
		.join("\n\n")
}

export async function summarizeBinaryWithGemini(
	buffer: Buffer,
	mimeType: string,
	filename?: string,
): Promise<UploadSummaryResult> {
	const { client, fileManager: manager } = ensureGeminiConfigured()

	const uploadResponse = await manager.uploadFile(buffer, {
		displayName: filename ?? "upload",
		mimeType,
	})

	if (!uploadResponse.file?.name) {
		throw new Error("Gemini file upload did not return a file name")
	}

	const file = await waitForFileReady(uploadResponse.file.name)
	if (!file.uri) {
		throw new Error("Gemini file metadata missing uri")
	}

	const prompt = buildPrompt(mimeType, filename)
	const modelId = env.CHAT_MODEL ?? "models/gemini-2.5-pro"

	try {
		// Usar aiClient para ter fallback, mas ainda precisa de fileUri do Gemini
		const model = aiClient
			? aiClient.getGenerativeModel({ model: modelId })
			: client.getGenerativeModel({ model: modelId })
		const filePart: { fileData: { fileUri: string; mimeType: string } } = {
			fileData: {
				fileUri: file.uri,
				mimeType,
			},
		}
		const result = await model.generateContent({
			contents: [
				{
					role: "user",
					parts: [filePart, { text: prompt }],
				},
			],
			generationConfig: {
				maxOutputTokens: 1024,
			},
		})

		const text = result.response.text().trim()
		return {
			text,
			metadata: {
				geminiFile: {
					name: file.name,
					uri: file.uri,
					mimeType,
				},
			},
		}
	} finally {
		try {
			await manager.deleteFile(uploadResponse.file.name)
		} catch (error) {
			console.warn("Failed to delete Gemini uploaded file", error)
		}
	}
}
