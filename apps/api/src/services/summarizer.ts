import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../env";

const SUMMARY_MAX_CHARS = 6000;
const ANALYSIS_MAX_CHARS = 20000; // Maior limite para análise profunda

const googleClient = env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(env.GOOGLE_API_KEY)
  : null;

export async function generateSummary(
  text: string,
  context?: { title?: string | null; url?: string | null },
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (!googleClient) {
    return buildFallbackSummary(trimmed, context);
  }

  const snippet = trimmed.slice(0, SUMMARY_MAX_CHARS);
  const modelId = "models/gemini-2.5-flash-preview-09-2025";
  try {
    const model = googleClient.getGenerativeModel({ model: modelId });
    const prompt = buildPrompt(snippet, context);
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
    });

    const textPart = result.response.text().trim();
    if (!textPart) {
      return buildFallbackSummary(trimmed, context);
    }
    return textPart;
  } catch (error) {
    console.warn("generateSummary fallback", error);
    return buildFallbackSummary(trimmed, context);
  }
}

function buildPrompt(
  snippet: string,
  context?: { title?: string | null; url?: string | null },
) {
  const header: string[] = [
    "Você é um assistente que resume conteúdos para o aplicativo Supermemory.",
    "Responda SEMPRE no formato Markdown com as seguintes seções, mesmo que alguma fique vazia:",
    "## Resumo Executivo — 2 a 3 frases diretas sobre o tema principal.",
    "## Pontos-Chave — Liste 4 a 6 bullets curtos com fatos relevantes, insights ou argumentos.",
    "## Próximas Ações — Liste bullets apenas se o conteúdo trouxer recomendações, passos ou instruções; caso contrário escreva `- (sem ações recomendadas)`.",
  ];

  if (context?.title) {
    header.push(`Título detectado: ${context.title}`);
  }
  if (context?.url) {
    header.push(`Fonte: ${context.url}`);
  }

  header.push(
    "Não inclua textos introdutórios como 'Segue o resumo'. Seja direto e objetivo.\n\nConteúdo a ser resumido:\n\n" +
      snippet,
  );

  return header.join("\n\n");
}

function buildFallbackSummary(
  text: string,
  context?: { title?: string | null; url?: string | null },
) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const executive = sentences.slice(0, 2);
  const remaining = sentences.slice(2);

  const points = remaining.slice(0, 5).map((sentence) => `- ${sentence}`);

  const actions: string[] = [];
  if (remaining.length === 0) {
    actions.push("- (sem ações recomendadas)");
  } else {
    const actionCandidates = remaining
      .filter((sentence) =>
        /deve|faça|passo|recomenda|sugere|precisa|evite|comece|conclua/i.test(
          sentence,
        ),
      )
      .slice(0, 4);
    if (actionCandidates.length > 0) {
      for (const candidate of actionCandidates) {
        actions.push(`- ${candidate}`);
      }
    } else {
      actions.push("- (sem ações recomendadas)");
    }
  }

  const parts: string[] = ["## Resumo Executivo"];
  if (executive.length > 0) {
    for (const sentence of executive) {
      parts.push(`- ${sentence}`);
    }
  } else {
    parts.push(`- ${text.slice(0, 200)}`);
  }

  parts.push("\n## Pontos-Chave");
  if (points.length > 0) {
    parts.push(...points);
  } else {
    parts.push("- (informações limitadas para destacar)");
  }

  parts.push("\n## Próximas Ações");
  parts.push(...actions);

  if (context?.url) {
    parts.push("\n## Fonte");
    parts.push(`- ${context.url}`);
  }

  return parts.join("\n");
}

/**
 * Gera análise profunda do conteúdo usando Gemini 2.0 Flash
 * Mais rápido e barato que o 2.5-pro, ideal para análise assíncrona
 */
export async function generateDeepAnalysis(
  text: string,
  context?: {
    title?: string | null;
    url?: string | null;
    contentType?: string | null;
  },
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (!googleClient) {
    console.warn("Google AI not configured, cannot generate deep analysis");
    return null;
  }

  const snippet = trimmed.slice(0, ANALYSIS_MAX_CHARS);

  try {
    const model = googleClient.getGenerativeModel({
      model: "models/gemini-2.5-flash-preview-09-2025",
    });

    const prompt = buildDeepAnalysisPrompt(snippet, context);

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.3,
      },
    });

    const analysis = result.response.text().trim();

    if (!analysis || analysis.length < 50) {
      console.warn("Deep analysis returned empty or very short result");
      return buildFallbackSummary(trimmed, context);
    }

    return analysis;
  } catch (error) {
    console.warn("generateDeepAnalysis fallback", error);
    return buildFallbackSummary(trimmed, context);
  }
}

function buildDeepAnalysisPrompt(
  snippet: string,
  context?: {
    title?: string | null;
    url?: string | null;
    contentType?: string | null;
  },
) {
  const isGitHub = context?.url?.includes("github.com");
  const isPDF = context?.contentType?.includes("pdf");
  const isWebPage = context?.contentType?.includes("html") || context?.url;

  const header: string[] = [
    "Você é um assistente analítico do Supermemory que cria resumos estruturados e insights profundos.",
    "Analise o conteúdo abaixo e responda SEMPRE no formato Markdown com as seguintes seções:",
    "",
    "## Resumo Executivo",
    "2-3 frases diretas sobre o tema principal, contexto e relevância do conteúdo.",
    "",
    "## Pontos-Chave",
    "Liste 5-8 bullets com:",
    "- Conceitos, ideias ou argumentos centrais",
    "- Fatos, dados ou estatísticas importantes",
    "- Insights ou conclusões relevantes",
    "",
  ];

  // Ajustar seções baseado no tipo de conteúdo
  if (isGitHub) {
    header.push(
      "## Tecnologias e Ferramentas",
      "Se aplicável, liste:",
      "- Linguagens de programação ou frameworks mencionados",
      "- Bibliotecas, APIs ou dependências relevantes",
      "- Arquitetura ou padrões de design",
      "",
    );
  }

  header.push(
    "## Próximas Ações",
    "Liste bullets se o conteúdo trouxer:",
    "- Passos práticos, tutoriais ou instruções",
    "- Recomendações ou melhores práticas",
    "- Chamadas para ação ou tarefas sugeridas",
    "Caso contrário, escreva: `- (sem ações práticas identificadas)`",
    "",
  );

  if (isPDF || isWebPage) {
    header.push(
      "## Contexto Adicional",
      "Se relevante, mencione:",
      "- Autores, organizações ou fontes citadas",
      "- Data de publicação ou atualização (se disponível)",
      "- Público-alvo ou caso de uso",
      "",
    );
  }

  if (context?.title) {
    header.push(`**Título:** ${context.title}`);
  }
  if (context?.url) {
    header.push(`**Fonte:** ${context.url}`);
  }

  header.push(
    "",
    "**IMPORTANTE:** Seja objetivo, analítico e direto. Não inicie com frases como 'Aqui está' ou 'Segue o resumo'.",
    "",
    "---",
    "",
    "Conteúdo a ser analisado:",
    "",
    snippet,
  );

  return header.join("\n");
}

export async function summarizeYoutubeVideo(
  url: string,
): Promise<string | null> {
  if (!googleClient) {
    console.warn("Google AI not configured, cannot analyze YouTube video");
    return null;
  }

  try {
    const modelId = "models/gemini-2.5-flash-preview-09-2025";
    const model = googleClient.getGenerativeModel({ model: modelId });

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
    ].join("\n");

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
    });

    const summary = result.response.text().trim();

    if (!summary || summary.length < 50) {
      console.warn(
        "YouTube video analysis returned empty or very short result",
      );
      return null;
    }

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("summarizeYoutubeVideo error:", message);

    // Se falhar com Gemini 2.0, não tentar fallback pois não funciona bem
    return null;
  }
}
