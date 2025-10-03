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
    return buildFallbackSummary(trimmed, context)
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
      return buildFallbackSummary(trimmed, context)
    }
    return textPart
  } catch (error) {
    console.warn("generateSummary fallback", error)
    return buildFallbackSummary(trimmed, context)
  }
}

function buildPrompt(snippet: string, context?: { title?: string | null; url?: string | null }) {
  const header: string[] = [
    "Você é um assistente que resume conteúdos para o aplicativo Supermemory.",
    "Responda SEMPRE no formato Markdown com as seguintes seções, mesmo que alguma fique vazia:",
    "## Resumo Executivo — 2 a 3 frases diretas sobre o tema principal.",
    "## Pontos-Chave — Liste 4 a 6 bullets curtos com fatos relevantes, insights ou argumentos.",
    "## Próximas Ações — Liste bullets apenas se o conteúdo trouxer recomendações, passos ou instruções; caso contrário escreva `- (sem ações recomendadas)`.",
  ]

  if (context?.title) {
    header.push(`Título detectado: ${context.title}`)
  }
  if (context?.url) {
    header.push(`Fonte: ${context.url}`)
  }

  header.push(
    "Não inclua textos introdutórios como 'Segue o resumo'. Seja direto e objetivo.\n\nConteúdo a ser resumido:\n\n" +
      snippet,
  )

  return header.join("\n\n")
}

function buildFallbackSummary(text: string, context?: { title?: string | null; url?: string | null }) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const executive = sentences.slice(0, 2)
  const remaining = sentences.slice(2)

  const points = remaining.slice(0, 5).map((sentence) => `- ${sentence}`)

  const actions: string[] = []
  if (remaining.length === 0) {
    actions.push("- (sem ações recomendadas)")
  } else {
    const actionCandidates = remaining
      .filter((sentence) => /deve|faça|passo|recomenda|sugere|precisa|evite|comece|conclua/i.test(sentence))
      .slice(0, 4)
    if (actionCandidates.length > 0) {
      for (const candidate of actionCandidates) {
        actions.push(`- ${candidate}`)
      }
    } else {
      actions.push("- (sem ações recomendadas)")
    }
  }

  const parts: string[] = ["## Resumo Executivo"]
  if (executive.length > 0) {
    for (const sentence of executive) {
      parts.push(`- ${sentence}`)
    }
  } else {
    parts.push(`- ${text.slice(0, 200)}`)
  }

  parts.push("\n## Pontos-Chave")
  if (points.length > 0) {
    parts.push(...points)
  } else {
    parts.push("- (informações limitadas para destacar)")
  }

  parts.push("\n## Próximas Ações")
  parts.push(...actions)

  if (context?.url) {
    parts.push("\n## Fonte")
    parts.push(`- ${context.url}`)
  }

  return parts.join("\n")
}

export async function summarizeYoutubeVideo(url: string): Promise<string | null> {
  if (!googleClient) {
    console.warn("Google AI not configured, cannot analyze YouTube video")
    return null
  }

  try {
    // Usar Gemini 2.0 Flash que suporta análise de vídeo do YouTube diretamente
    const modelId = "models/gemini-2.0-flash-exp"
    const model = googleClient.getGenerativeModel({ model: modelId })

    const prompt = [
      "Analise este vídeo do YouTube e crie um resumo estruturado em português.",
      "",
      "## Resumo Executivo",
      "Escreva 2-3 frases sobre o tema principal e contexto geral do vídeo.",
      "",
      "## Pontos Principais",
      "Liste 5-10 bullet points com:",
      "- Tópicos importantes discutidos",
      "- Insights e conclusões chave",
      "- Dados, estatísticas ou fatos relevantes",
      "",
      "## Instruções e Ações",
      "Se aplicável, liste:",
      "- Passos práticos mencionados",
      "- Recomendações importantes",
      "- Chamadas para ação",
      "",
      "## Contexto Visual",
      "Se relevante, descreva:",
      "- Elementos visuais importantes (gráficos, demos, slides)",
      "- Apresentadores ou pessoas que aparecem",
      "",
      "Seja objetivo e detalhado. Não inicie com frases como 'Aqui está' ou 'Segue o resumo'.",
    ].join("\n")

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                mimeType: "video/*",
                fileUri: url,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.4,
      },
    })

    const summary = result.response.text().trim()
    
    if (!summary || summary.length < 50) {
      console.warn("YouTube video analysis returned empty or very short result")
      return null
    }
    
    return summary
  } catch (error: any) {
    console.error("summarizeYoutubeVideo error:", error?.message || error)
    
    // Se falhar com Gemini 2.0, não tentar fallback pois não funciona bem
    return null
  }
}
