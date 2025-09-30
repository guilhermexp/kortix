import { GoogleGenerativeAI } from "@google/generative-ai"
import { env } from "../env"

const SUMMARY_MAX_CHARS = 6000

const googleClient = env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(env.GOOGLE_API_KEY)
  : null

export async function generateSummary(
  text: string,
  context?: { title?: string | null; url?: string | null },
): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (!googleClient) {
    return buildFallbackSummary(trimmed)
  }

  const snippet = trimmed.slice(0, SUMMARY_MAX_CHARS)
  const modelId = env.SUMMARY_MODEL ?? env.CHAT_MODEL ?? "models/gemini-2.5-pro"
  try {
    const model = googleClient.getGenerativeModel({ model: modelId })
    const prompt = buildPrompt(snippet, context)
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 256,
      },
    })

    const textPart = result.response.text().trim()
    if (!textPart) {
      return buildFallbackSummary(trimmed)
    }
    return textPart
  } catch (error) {
    console.warn("generateSummary fallback", error)
    return buildFallbackSummary(trimmed)
  }
}

function buildPrompt(snippet: string, context?: { title?: string | null; url?: string | null }) {
  const header: string[] = [
    "Você é um assistente que resume conteúdos para o aplicativo Supermemory.",
    "Produza um resumo conciso em português (3 a 5 frases), destacando o assunto principal e pontos-chave.",
    "Se houver instruções ou passos, liste-os de forma breve.",
  ]

  if (context?.title) {
    header.push(`Título detectado: ${context.title}`)
  }
  if (context?.url) {
    header.push(`Fonte: ${context.url}`)
  }

  header.push("Conteúdo a ser resumido:\n\n" + snippet)
  return header.join("\n\n")
}

function buildFallbackSummary(text: string) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const summary = sentences.slice(0, 3).join(". ")
  return summary ? summary + (summary.endsWith(".") ? "" : ".") : text.slice(0, 200)
}

export async function summarizeYoutubeVideo(url: string): Promise<string | null> {
  if (!googleClient) return null

  const modelId = env.CHAT_MODEL ?? "models/gemini-2.5-pro"

  const prompt = [
    "Você é um assistente do Supermemory encarregado de analisar vídeos do YouTube.",
    "Gere um resumo em português destacando tema principal, tópicos importantes e, quando possível, passos ou recomendações mencionadas.",
    "Inclua uma lista de 3 a 5 bullet points com fatos ou insights chave.",
    "Se houver chamadas para ação, observações ou instruções relevantes, descreva-as de forma objetiva.",
    `Link do vídeo: ${url}`,
  ].join("\n\n")

  try {
    const model = googleClient.getGenerativeModel({ model: modelId })
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: url,
                mimeType: "video/mp4",
              },
            } as any,
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 512,
      },
    })

    const summary = result.response.text().trim()
    return summary.length > 0 ? summary : null
  } catch (error) {
    console.warn("summarizeYoutubeVideo fallback", error)
    return null
  }
}
